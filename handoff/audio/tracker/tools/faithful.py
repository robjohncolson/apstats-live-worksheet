#!/usr/bin/env python3
"""Faithful arranger: one tracker channel per ORIGINAL channel, notes copied verbatim (timing, octave, length),
drums from the original drum data. No added pads / arps / chord fills / doubled layers / auto vibrato.

Sources
  genesis : SMPS note data (sonic/smps.py), loop window [S, S+P) from convert.analyze; per-channel FM voice (most-used EF
            voice) decoded from the song's voice table and mapped to 2-op; PSG1/2 = SN76489 square;
            drums = DAC samples (kick/snare/hat/tom by sample id) + PSG3 noise (hat).
  opl2    : IMF note data (parkmusic/keen5/wotb_q31.json, exact 16th grid); per-channel OPL registers
            (patches/opl-patches-ch.json); IMF ch5 = kick, ch6 = hats/snare (melodic-mode percussion in the original).
  nes     : Park Bounce v2 score, thinned to lead + bass + kick/snare.
usage: python3 tools/faithful.py [song-id ...]
"""
import json,os,sys,io,contextlib,struct
from collections import Counter
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,HERE); from arrange import PRESETS,patch_to_inst
CFG=json.load(open(os.path.join(HERE,'songs.config.json')))
MAX_VOICES=8          # melodic voices per song (genesis/opl2 FM voice = 3 nodes, PSG/NES = 2)
LP_VOICES=5           # lowPower melodic cap
def J(x): return json.loads(json.dumps(x))
# ---------------------------------------------------------------- genesis
SONIC='/workspace/sonic'
OPS=[1,3,2,4]; CARRIERS={0:[4],1:[4],2:[4],3:[4],4:[2,4],5:[2,3,4],6:[2,3,4],7:[1,2,3,4]}
def decode(r,a):
    fbalg=r[a]; f=lambda base:{OPS[i]:r[a+base+i] for i in range(4)}
    dm,ra,dr,d2,rr,tl=f(1),f(5),f(9),f(13),f(17),f(21)
    return {'alg':fbalg&7,'fb':(fbalg>>3)&7,'op':{o:{'mul':dm[o]&15,'ar':ra[o]&31,'d1r':dr[o]&31,'d2r':d2[o]&31,'d1l':rr[o]>>4,'rr':rr[o]&15,'tl':tl[o]&127} for o in (1,2,3,4)}}
def rate_t(r,scale=8.0): return 10.0 if r==0 else max(0.004,scale*2**(-r/3.0))
def two_op(p):          # identical mapping to tools/patches/smps_patches.py
    alg=p['alg']; car=p['op'][4]; mods=[o for o in (1,2,3) if o not in CARRIERS[alg]]
    m=min(mods,key=lambda o:p['op'][o]['tl']) if mods else None
    mul=lambda x:0.5 if x==0 else x
    out={'alg':alg,'fb':p['fb'],'carMul':mul(car['mul'])}
    if m is None: out.update(ratio=1,index=0,modDecay=0.2,modSus=1)
    else:
        M=p['op'][m]; amp=10**(-0.75*M['tl']/20)
        out.update(modOp=m,ratio=round(mul(M['mul'])/mul(car['mul']),3),index=round(min(8,7*amp),3),
                   modAttack=round(rate_t(M['ar'],0.6) if M['ar']<31 else 0.001,4),modDecay=round(rate_t(M['d1r']),4),modSus=round(10**(-3*M['d1l']/20),3))
    if len(CARRIERS[alg])>1: out['index']=round(out['index']*0.6,3)
    out['adsr']=[round(rate_t(car['ar'],0.6) if car['ar']<31 else 0.002,4),round(min(2,rate_t(car['d1r'])),4),
                 round(10**(-3*car['d1l']/20) if car['d1r'] else 1,3),round(min(1.5,rate_t(car['rr']*2+1,4)),4)]
    out['modWave']='triangle' if p['fb']>=5 and out.get('modOp')==1 else 'sine'
    return out
# DAC sample id -> drum. S1: 81 kick, 82 snare, 83+ timpani (tom). S3K ids measured by beat position per song.
S3K_DRUM={0x81:'S',0x82:'T',0x83:'T',0x84:'T',0x85:'T',0x86:'K',0xAA:'H',0xB6:'T',0xBA:'T'}
TOM_HZ={0x82:220,0x83:180,0x84:150,0x85:120,0xB6:200,0xBA:140}
def dac_drum(var,n):
    if var=='s1': return ('K' if n==0x81 else 'S' if n==0x82 else 'T' if 0x83<=n<=0x8F else None)
    if n in S3K_DRUM: return S3K_DRUM[n]
    sys.path.insert(0,SONIC); import convert as C
    return {36:'K',38:'S',42:'H'}.get(C.dacmap('s3k',n))
def smps_song(job):
    cwd=os.getcwd(); os.chdir(SONIC); sys.path.insert(0,SONIC)
    from smps import Song; import convert as C
    r1=open('sonic1rev1.bin','rb').read(); r3=open('sonic3.bin','rb').read(); rk=open('knuckles.bin','rb').read()
    def s3(idx):
        bank=0x10|(r3[0xe6b48+idx]&0x0F); ptr=struct.unpack_from('<H',r3,0xe761a+2*idx)[0]; return Song(r3,'s3k',bank*0x8000+ptr-0x8000,bank)
    S={'sonic1-starlight':lambda:('s1',Song(r1,'s1',struct.unpack_from('>I',r1,0x71a9c+12)[0])),
       'sonic3-icecap':lambda:('s3k',s3(10)),'sonic3-launchbase':lambda:('s3k',s3(12)),
       'sk-mushroomhill':lambda:('s3k',Song(rk,'s3k',0x1D*0x8000+0x8AFE-0x8000,0x1D))}[job]
    var,s=S()
    C.RATE[0]=C.rate(var,s.tempo)
    with contextlib.redirect_stdout(io.StringIO()): ev,S0,P=C.analyze(s)
    bpm=60*60*C.RATE[0]/24
    os.chdir(cwd); return var,s,ev,S0,P,bpm
def smps_atten(var,s,ch,vid):
    """original channel attenuation in dB: header volume + E6 volume changes (mode over the 2nd half of the run, i.e. the loop)
    + carrier TL for FM (0.75 dB/step); PSG volume nibble = 2 dB/step (+6 dB: SN76489 sits below FM in the Genesis mix)."""
    be='>' if var=='s1' else '<'; p=s.start+6; hv={}
    for t in s.tracks:
        ptr,tr,vol=struct.unpack_from(be+'Hbb',s.r,p); p+=6 if t.kind=='psg' else 4; hv[t.name]=vol
    t=next(x for x in s.tracks if x.name==ch); h=getattr(t,'vhist',[0]); vd=Counter(h[len(h)//2:]).most_common(1)[0][0]
    if t.kind=='psg': return 2.0*max(0,hv[ch]+vd)+6
    d=decode(s.r,s.voice_addr(vid)); ctl=min(d['op'][o]['tl'] for o in CARRIERS[d['alg']])
    return 0.75*max(0,hv[ch]+vd+ctl)
def tweak(inst,tw):
    fm=inst.get('fm')
    if fm:
        if 'indexMul' in tw: fm['index']=round(fm['index']*tw['indexMul'],3)
        if 'modSusMul' in tw: fm['modSus']=round(fm['modSus']*tw['modSusMul'],3)
    a=inst['adsr']
    if 'sus' in tw: a[2]=tw['sus']
    if 'release' in tw: a[3]=tw['release']
    if 'decay' in tw: a[1]=tw['decay']
def build_genesis(name,c):
    o=c['opts']; f=c['faithful']; var,s,ev,S0,P,bpm=smps_song(f['job'])
    RPB=o.get('rowsPerBeat',4); fpr=24/RPB; NR=int(P/fpr)
    notes={}; drums=[]
    for ch,kind,a,b,p in ev:
        if not (S0<=a<S0+P): continue
        r=round((a-S0)/fpr,3); l=round(min(b,S0+P)-a)/fpr
        if kind in ('dac','dacx'):
            d=dac_drum(var,p)
            if d: drums.append({'r':r,'n':d,'v':1.0 if d!='H' else 0.6,'d':'%02X'%p,**({'f':TOM_HZ.get(p,160)} if d=='T' else {})})
        elif p=='noise': drums.append({'r':r,'n':'H','v':0.45})
        elif p is not None:
            v=1.0
            for rule in f.get('noteRules',{}).get(ch,[]):          # e.g. IceCap PSG1 G6 bell figure: octave down, pulled back
                if p>=rule['minNote']: p+=rule.get('shift',0); v=rule.get('v',v)
            notes.setdefault(ch,[]).append([r,round(max(0.25,l),3),p,v])
    keep=f['keep']; dropped={ch:len(notes.get(ch,[])) for ch in notes if ch not in keep}
    # instruments: each kept channel gets its own most-used SMPS voice
    s.run(4000)
    ins={'drums':J(PRESETS['genesis']['drums'])}
    ins['drums']['tom']={'wave':'sine','from':200,'to':90,'decay':0.16,'vol':0.6}
    for k in ('kick','snare','hat'): ins['drums'][k]['vol']=round(ins['drums'][k]['vol']*0.7,3)   # headroom: full original kit + up to 7 voices
    roles=f['roles']; role_of={v:k for k,v in roles.items()}
    def vid_of(ch):
        t=next(x for x in s.tracks if x.name==ch); vc={k:v for k,v in getattr(t,'vc',{}).items() if not (var=='s3k' and k&0x80)}
        return None if ch.startswith('PSG') or not vc else max(vc,key=vc.get)
    att={ch:smps_atten(var,s,ch,vid_of(ch)) for ch in keep}
    for ch in keep:
        role=role_of.get(ch,'arp'); t=next(x for x in s.tracks if x.name==ch)
        vc={k:v for k,v in getattr(t,'vc',{}).items() if not (var=='s3k' and k&0x80)}
        vid=None
        if ch.startswith('PSG') or not vc: p={'channel':ch,'psg':True}
        else:
            vid=max(vc,key=vc.get); raw=decode(s.r,s.voice_addr(vid)); p={'channel':ch,'voice':vid,'fm':two_op(raw)}
        inst=patch_to_inst('pad' if role=='pad' else role,p,'genesis')
        inst['vol']=round(f.get('levels',{}).get(ch,{'lead':0.2,'bass':0.42}.get(role,0.105)),3)
        if f.get('volumes')=='smps':         # original per-channel volume relative to the lead channel
            rel=max(-18,min(7,att[roles['lead']]-att[ch]))+f.get('trimDb',{}).get(ch,0)
            inst['vol']=round(0.2*10**(rel/20),3); inst['smpsAttenDb']=round(att[ch],2)
        tweak(inst,f.get('tweak',{}).get(ch,{}))
        inst.pop('lowPowerOff',None)
        if ch in f.get('lowPowerOff',[]): inst['lowPowerOff']=True
        ins[ch]=inst
    return finish(name,o,bpm,RPB,NR,keep,notes,drums,ins,roles,'genesis',dropped,f)
# ---------------------------------------------------------------- opl2 (Keen 5)
def build_opl2(name,c):
    o=c['opts']; f=c['faithful']
    Q=json.load(open(f['src'])); P=json.load(open(f['patches']))
    RPB=4; NR=f['bars']*16; notes={}; drums=[]
    for ch,st,du,p in Q:
        if st>=NR: continue
        if ch==5: drums.append({'r':st,'n':'K','v':0.9}); continue
        if ch==6: drums.append({'r':st,'n':{38:'S',42:'H',46:'H'}[p],'v':{38:0.8,42:0.55,46:0.8}[p]}); continue
        notes.setdefault('ch%d'%ch,[]).append([st,round(max(0.5,min(du,NR-st)*0.95),3),p])
    keep=f['keep']; roles=f['roles']; role_of={v:k for k,v in roles.items()}
    ins={'drums':J(PRESETS['opl2']['drums'])}
    for ch in keep:
        role=role_of.get(ch,'arp'); inst=patch_to_inst(role,P[ch],'opl2')
        inst['vol']=round(f.get('levels',{}).get(ch,{'lead':0.24,'bass':0.45}.get(role,0.12)),3); inst.pop('lowPowerOff',None)
        if ch in f.get('lowPowerOff',[]): inst['lowPowerOff']=True
        ins[ch]=inst
    return finish(name,o,f['bpm'],RPB,NR,keep,notes,drums,ins,roles,'opl2',{},f)
# ---------------------------------------------------------------- nes (Park Bounce, original song)
def build_nes(name,c):
    o=c['opts']; src=json.load(open(o['src'] if 'src' in o else c['src'])); bpm=src['bpm']; RPB=4; row=60/bpm/RPB
    NR=round(src['loopSeconds']/row); T=src['tracks']; notes={'lead':[],'bass':[]}; drums=[]
    for k in ('lead','bass'):
        for s0,d,p,v in sorted(T[k]): notes[k].append([round(s0/row,3),round(max(0.25,d/row*0.9),3),p])
    for s0,d,p,v in T['drum']:
        if p in (36,38): drums.append({'r':round(s0/row),'n':'K' if p==36 else 'S','v':round(v*0.8,2)})
    ins=J(PRESETS['nes']); ins['lead']['duty']=o.get('leadDuty',0.25)
    for k in ('pad','arp'): ins.pop(k)
    ins['drums'].pop('hat'); ins['lead']['vol']=0.22; ins['bass']['vol']=0.55
    return finish(name,o,bpm,RPB,NR,['lead','bass'],notes,drums,ins,{'lead':'lead','bass':'bass','arp':'lead'},'nes',
                  {'arp':'(generated) removed','pad':'(generated) removed','hats':sum(1 for x in T['drum'] if x[2]==42)},c.get('faithful',{}))
# ---------------------------------------------------------------- common
def finish(name,o,bpm,RPB,NR,keep,notes,drums,ins,roles,plat,dropped,f):
    RPP=RPB*4; BARS=NR//RPP; assert NR%RPP==0,(name,NR)
    assert len(keep)<=MAX_VOICES,(name,len(keep))
    cells={'drums':sorted(drums,key=lambda x:x['r'])}
    for ch in keep:
        L=sorted(notes.get(ch,[]))
        out=[]
        for i,(r,l,p,*vv) in enumerate(L):       # monophonic channel: a note ends where the next one starts
            if out and out[-1]['r']==r: continue
            if i+1<len(L): l=min(l,max(0.25,L[i+1][0]-r))
            out.append({'r':r,'n':p,'l':l,**({'v':vv[0]} if vv and vv[0]!=1.0 else {})})
        cells[ch]=out
    pats={}; order=[]; seen={}
    for bar in range(BARS):
        pat={ch:[{**x,'r':round(x['r']-bar*RPP,3)} for x in cells[ch] if bar*RPP<=x['r']<bar*RPP+RPP] for ch in cells}
        pat={k:v for k,v in pat.items() if v}
        kk=json.dumps(pat,sort_keys=True)
        if kk not in seen: seen[kk]='P%02d'%len(pats); pats[seen[kk]]=pat
        order.append(seen[kk])
    chans=(['drums'] if drums else [])+list(keep)
    song={'id':o['id'],'title':o['title'],'source':o.get('source',''),'bpm':round(bpm,4),'rowsPerBeat':RPB,'rowsPerPattern':RPP,
          'ticksPerRow':6 if RPB==4 else 4,'swing':0,'key':o.get('key','C'),'scale':o.get('scale','major'),'loop':True,
          'palette':o['palette'],**({'drumKit':f['drumKit']} if f.get('drumKit') else {}),**({'sfxMap':f['sfxMap']} if f.get('sfxMap') else {}),'instrumentSet':plat,'arrangement':'faithful','channels':chans,'roles':roles,
          'channelInfo':{ch:ins[ch].get('from',ch) for ch in keep},
          'mix':{ch:{**{'vol':0,'gate':1,'bright':1,'oct':0,'mute':False,'solo':False},**f.get('mix',{}).get(ch,{})} for ch in chans},'instruments':ins,'patterns':pats,'order':order}
    lp=[ch for ch in keep if ins[ch].get('lowPowerOff')]
    info={'levels':{ch:ins[ch]['vol'] for ch in keep},'bars':BARS,'bpm':round(bpm,3),'patterns':len(pats),'kept':keep,'dropped':dropped,
          'notes':{ch:len(cells[ch]) for ch in keep},'drumHits':Counter(x['n'] for x in drums),
          'voices':len(keep),'voicesLowPower':len(keep)-len(lp),'loopSec':round(NR*60/bpm/RPB,2)}
    assert info['voicesLowPower']<=LP_VOICES,(name,info)
    return song,info
def key_scale(song,c):
    o=c['opts']
    if 'key' in o: return
    sys.path.insert(0,HERE); from arrange import corr,MAJ,MIN,NAMES
    h=[0]*12
    for P in song['patterns'].values():
        for ch,L in P.items():
            if ch=='drums': continue
            for x in L: h[x['n']%12]+=x['l']
    best=max((corr(h,[prof[(i-t)%12] for i in range(12)]),t,m) for t in range(12) for m,prof in (('major',MAJ),('minor',MIN)))
    song['key'],song['scale']=NAMES[best[1]],best[2]
if __name__=='__main__':
    only=[a for a in sys.argv[1:] if not a.startswith('--')]; report={}
    for name,c in CFG.items():
        if only and name not in only: continue
        plat=c['opts']['platform']
        song,info=(build_genesis if plat=='genesis' else build_opl2 if plat=='opl2' else build_nes)(name,c)
        key_scale(song,c); info['key']=song['key']+' '+song['scale']
        outp=os.path.join(ROOT,'songs',name+'.json')
        if os.path.exists(outp) and '--reset-mix' not in sys.argv:     # keep a hand mix exported from demo.html
            old=json.load(open(outp)).get('mix',{})
            for ch,m in old.items():
                if ch in song['mix']: song['mix'][ch].update(m)
        json.dump(song,open(os.path.join(ROOT,'songs',name+'.json'),'w'),separators=(',',':'))
        report[name]=info; print(name,json.dumps(info,default=dict))
    json.dump(report,open(os.path.join(HERE,'faithful-report.json'),'w'),indent=1,default=dict)
