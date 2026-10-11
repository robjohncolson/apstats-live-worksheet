#!/usr/bin/env python3
"""Accurate Sega export (song format 'smps-v2'): every original channel, every note with its original
per-note data from the SMPS driver emulation (tools/sega/smps_drv.py):
  FM  cell: r, l (rows; key-off incl. note fill), n (MIDI float incl. E1 detune), vo (voice id), va (channel volume ->
            carrier TL add), pb (E0 pan byte if not centre), pc ([[frame60, cents],..] modulation / tie pitch curve)
  PSG cell: r, l, n, vc ([[frame60, attenuation 0-15],..] = channel volume + ROM PSG envelope), pc
  noise   : PSG3 cell with nz (SN76489 noise mode byte) + vc
  DAC     : drums cell d (sample id) + n (synth fallback K/S/T/H)
song.voices = the song's SMPS voice table decoded to YM2612 operator parameters (4-op engine); instruments[ch] keeps a
2-op approximation of the channel's most used voice for lowPower. song.intro = patterns played once before song.order loops.
"""
import json,os,sys,math,struct
from collections import Counter
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,HERE); sys.path.insert(0,os.path.join(HERE,'ref')); sys.path.insert(0,os.path.join(HERE,'sega'))
import faithful as F, sega_songs as G, smps_drv as D
from arrange import PRESETS,patch_to_inst
CFG=json.load(open(os.path.join(HERE,'songs.config.json')))
LEVELS={'fm':0.261,'psg':0.14,'dac':0.26}         # YM channel full scale / SN76489 channel / DAC (as in tools/ref/ref_render.py)
def J(x): return json.loads(json.dumps(x))
def intro_start(d,S0,P):
    """smallest S such that every note in [S,S0) repeats exactly one loop (P tf) later"""
    sig={}
    for ch,L in d.notes.items():
        for n in L:
            k=(ch,n['tf0'],n.get('base'),n.get('voice'),n.get('vol'),n.get('tf1',n['tf0'])-n['tf0'],n.get('id'))
            sig[k]=1
    def ok(x):
        for ch,L in d.notes.items():
            for n in L:
                if n['tf0']!=x: continue
                k=(ch,n['tf0']+P,n.get('base'),n.get('voice'),n.get('vol'),n.get('tf1',n['tf0'])-n['tf0'],n.get('id'))
                if k not in sig: return False
        return True
    S=S0
    while S>0 and ok(S-1): S-=1
    return S
def build(name,c):
    o=c['opts']; f=c['faithful']; job=f['job']
    var,s0,ev,S0,P,bpm=F.smps_song(job)
    RPB=o.get('rowsPerBeat',4); fpr=24/RPB; RPP=RPB*4; NR=int(P/fpr); assert NR%RPP==0
    d,kit=G.driver(job); rate=F.__dict__.get('_rate')
    frames=int((S0+2*P)/(bpm*24/60/60)*1.0)+600
    d.run(frames)
    S=intro_start(d,S0,P)
    # align the loop to a row boundary of the original grid: rows count from the loop start
    IR=math.ceil(S/fpr); IR=int(math.ceil(IR/1.0))
    def row(tf): return round((tf-S)/fpr+IR,4)
    END=S+P
    cells={}; drums=[]; vused=Counter(); stats=Counter()
    for ch,L in d.notes.items():
        if ch=='DAC':
            for n in L:
                if n['tf0']>=END: continue
                dd=F.dac_drum(var if var=='s1' else 's3k',n['id'])
                drums.append({'r':row(n['tf0']),'n':dd or 'K','d':'%02X'%n['id'],**({'f':F.TOM_HZ.get(n['id'],160)} if dd=='T' else {})})
            continue
        out=[]
        kind='fm' if ch.startswith('FM') else 'psg'
        for n in L:
            if n['tf0']>=END: continue
            tf1=min(n['tf1'],END) if n['tf0']>=S else n['tf1']
            l=round(max(0.05,(tf1-n['tf0'])/fpr),3)
            val=n['base']+n['det']
            midi=69+12*math.log2((D.fm_hz(val) if kind=='fm' else D.psg_hz(val))/440)
            cell={'r':row(n['tf0']),'l':l,'n':round(midi,2)}
            hz0=D.fm_hz(val) if kind=='fm' else D.psg_hz(val)
            pc=[]; last=0
            for fr,v in n['curve']:
                if fr==0: continue
                hz=D.fm_hz(v) if kind=='fm' else D.psg_hz(v); cts=round(1200*math.log2(hz/hz0),1)
                if cts!=last: pc.append([fr,cts]); last=cts
            if pc: cell['pc']=pc; stats['modNotes']+=1
            if kind=='fm':
                cell['vo']=n['voice']; cell['va']=n['vol']; vused[n['voice']]+=1
                if n['pan']&0xC0!=0xC0: cell['pb']=n['pan']
            else:
                cell['vc']=[list(x) for x in n['vcurve']] or [[0,max(0,min(15,n['vol']))]]
                if n['noise'] is not None: cell['nz']=n['noise']
            for rule in f.get('noteRules',{}).get(ch,[]):            # approved hand choices (e.g. IceCap PSG1 high bell)
                if cell['n']>=rule['minNote']-0.5: cell['n']=round(cell['n']+rule.get('shift',0),2); cell['v']=rule.get('v',1)
            out.append(cell)
        if out: cells[ch]=out
    chans=[ch for ch in ['FM1','FM2','FM3','FM4','FM5','FM6','PSG1','PSG2','PSG3'] if ch in cells]
    # lowPower fallback instruments (2-op approximation of each FM channel's most used voice; PSG square)
    ins={'drums':J(PRESETS['genesis']['drums'])}
    ins['drums']['tom']={'wave':'sine','from':200,'to':90,'decay':0.16,'vol':0.6}
    for k in ('kick','snare','hat'): ins['drums'][k]['vol']=round(ins['drums'][k]['vol']*0.7,3)
    roles=f['roles']; role_of={v:k for k,v in roles.items()}
    voices={}
    for ch in chans:
        role=role_of.get(ch,'arp')
        if ch.startswith('FM'):
            vc=Counter(x['vo'] for x in cells[ch]); vid=vc.most_common(1)[0][0]
            raw=F.decode(d.r,d.voice_addr(vid)); p={'channel':ch,'voice':vid,'fm':F.two_op(raw)}
        else: p={'channel':ch,'psg':True}
        inst=patch_to_inst('pad' if role=='pad' else role,p,'genesis'); inst.pop('lowPowerOff',None)
        if ch in f.get('lowPowerOff',[]): inst['lowPowerOff']=True
        ins[ch]=inst
    for vid in sorted(vused):
        v=D.voice(d,vid) if False else D.decode_voice(d.r[d.voice_addr(vid):d.voice_addr(vid)+25])
        voices[str(vid)]={'alg':v['alg'],'fb':v['fb'],'op':[v['op'][k] for k in (1,2,3,4)]}
    # patterns: intro (played once) + loop
    def split(r0,r1):
        pats=[]
        r=r0
        while r<r1:
            n=min(RPP,r1-r); pat={}
            for ch,L in list(cells.items())+[('drums',drums)]:
                xs=[{**x,'r':round(x['r']-r,4)} for x in L if r<=x['r']<r+n]
                if xs: pat[ch]=xs
            if n!=RPP: pat['rows']=n
            pats.append(pat); r+=n
        return pats
    patterns={}; seen={}
    def name_of(p):
        k=json.dumps(p,sort_keys=True)
        if k not in seen: seen[k]='P%02d'%len(seen); patterns[seen[k]]=p
        return seen[k]
    intro=[name_of(p) for p in split(0,IR)]; order=[name_of(p) for p in split(IR,IR+NR)]
    mix={ch:{**{'vol':0,'gate':1,'bright':1,'oct':0,'mute':False,'solo':False},**f.get('mix2',{}).get(ch,{})} for ch in ['drums']+chans}
    for ch,m in f.get('approvedMix',{}).items():          # Robert's approved hand choices, on top of the accurate volumes
        if ch in mix: mix[ch].update({k:v for k,v in m.items() if not k.startswith('_')})

    song={'id':o['id'],'title':o['title'],'source':o.get('source',''),'format':'smps-v2','driver':{'s1':'Sonic 1 68k SMPS','s3':'S3 Z80 SMPS','sk':'S&K Z80 SMPS'}[kit],
          'bpm':round(bpm,4),'rowsPerBeat':RPB,'rowsPerPattern':RPP,'ticksPerRow':6 if RPB==4 else 4,'framesPerRow':fpr,'swing':0,
          'key':o.get('key','C'),'scale':o.get('scale','major'),'loop':True,'gainTrim':o.get('gainTrim',1),'palette':o['palette'],'drumKit':f.get('drumKit'),
          **({'sfxMap':f['sfxMap']} if f.get('sfxMap') else {}),'instrumentSet':'genesis','arrangement':'faithful-v2',
          'channels':['drums']+chans,'roles':roles,'levels':LEVELS,'voices':voices,
          'channelInfo':{ch:('YM2612 '+ch if ch.startswith('FM') else 'SN76489 '+ch+(' (noise)' if any('nz' in x for x in cells[ch]) else '')) for ch in chans},
          'lowPowerOff':[ch for ch in chans if ins[ch].get('lowPowerOff')],
          'mix':mix,'instruments':ins,'patterns':patterns,'intro':intro,'order':order}
    info={'introTf':S,'introRows':IR,'introSec':round(IR*60/bpm/RPB,2),'loopRows':NR,'loopSec':round(NR*60/bpm/RPB,2),'bpm':round(bpm,3),
          'channels':chans,'notes':{ch:len(cells[ch]) for ch in chans},'dac':len(drums),'voices':sorted(vused),'modNotes':stats['modNotes'],
          'patterns':len(patterns),'unknownOps':sorted(d.unk)}
    return song,info
if __name__=='__main__':
    only=[a for a in sys.argv[1:] if not a.startswith('--')]; rep={}
    for name,c in CFG.items():
        if c['opts']['platform']!='genesis' or (only and name not in only): continue
        song,info=build(name,c)
        F.key_scale(song,c) if False else None
        old=os.path.join(ROOT,'songs',name+'.json')
        if os.path.exists(old):
            oj=json.load(open(old)); song['key'],song['scale']=oj.get('key','C'),oj.get('scale','major')
        json.dump(song,open(old,'w'),separators=(',',':'))
        rep[name]=info; print(name,json.dumps(info))
    json.dump(rep,open(os.path.join(HERE,'smps-export-report.json'),'w'),indent=1)
