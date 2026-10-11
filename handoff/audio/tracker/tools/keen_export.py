#!/usr/bin/env python3
"""Accurate Keen 5 'Wednesday on the Beach' export (song format 'opl-v2') straight from the IMF register stream:
every note = one OPL2 key-on with the channel's FULL register snapshot at that moment (AM/VIB/EGT/KSR/MUL, KSL/TL,
AR/DR, SL/RR, WS (forced sine: the song never enables waveform select), FB/CON) -> song.voices; exact IMF timing
(560 Hz ticks) mapped onto the approved 36-bar / 16th-row grid (bpm from the IMF length); pitch changes while a key is
held -> 'pc' cents curve; 0xBD depth bits -> oplDepth. IMF channels 5/6 (melodic-mode drums in the original) are
chip channels too. usage: python3 tools/keen_export.py"""
import pickle,struct,json,math,os,sys
from collections import Counter
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,HERE); from arrange import PRESETS,patch_to_inst
CFG=json.load(open(os.path.join(HERE,'songs.config.json')))['keen-wotb']
OFF=[0,1,2,8,9,10,16,17,18]
def slot(regs,o):
    a=regs.get(0x20+o,0); b=regs.get(0x40+o,0); c=regs.get(0x60+o,0); d=regs.get(0x80+o,0)
    return {'am':a>>7,'vib':(a>>6)&1,'eg':(a>>5)&1,'ksr':(a>>4)&1,'mul':[0.5,1,2,3,4,5,6,7,8,8,10,10,12,12,15,15][a&15],
            'ksl':b>>6,'tl':b&63,'ar':c>>4,'dr':c&15,'sl':d>>4,'rr':d&15,'ws':0}
def build():
    ch=pickle.load(open('/workspace/parkmusic/keen5/chunks.pkl','rb'))[197]; n=struct.unpack_from('<H',ch,0)[0]
    cm=[struct.unpack_from('<BBH',ch,2+i) for i in range(0,n,4)]
    regs={}; t=0; on=[None]*9; notes={k:[] for k in range(9)}; bd=0
    def hz(c): blk=(regs.get(0xB0+c,0)>>2)&7; f=regs.get(0xA0+c,0)|((regs.get(0xB0+c,0)&3)<<8); return f*49716/2**(20-blk)
    def snap(c):
        o=OFF[c]; cc=regs.get(0xC0+c,0)
        return {'mod':slot(regs,o),'car':slot(regs,o+3),'fb':(cc>>1)&7,'con':cc&1}
    for r,v,d in cm:
        sec=t/560.0; old=regs.get(r,0); regs[r]=v
        if 0xB0<=r<=0xB8 or 0xA0<=r<=0xA8:
            c=r&15
            if c<9:
                keyed=bool(regs.get(0xB0+c,0)&0x20)
                if on[c] is not None and (not keyed or (r>=0xB0 and not old&0x20)):
                    on[c]['end']=sec; notes[c].append(on[c]); on[c]=None
                if keyed and on[c] is None and hz(c)>0:
                    on[c]={'start':sec,'hz':hz(c),'V':snap(c),'pc':[]}
                elif keyed and on[c] is not None and hz(c)>0 and abs(hz(c)-on[c]['hz'])>1e-6:
                    on[c]['pc'].append((sec-on[c]['start'],round(1200*math.log2(hz(c)/on[c]['hz']),1)))
        if r==0xBD: bd=v
        t+=d
    L=t/560.0
    for c in range(9):
        if on[c]: on[c]['end']=L; notes[c].append(on[c])
    return notes,L,bd
def main():
    notes,L,bd=build(); f=CFG['faithful']; o=CFG['opts']
    RPB=4; RPP=16; NR=f['bars']*16; rd=L/NR; bpm=60/(rd*RPB)
    voices={}; vkey={}; cells={}
    for c,Ls in notes.items():
        if not Ls: continue
        out=[]
        for x in Ls:
            k=json.dumps(x['V'],sort_keys=True)
            if k not in vkey: vkey[k]=str(len(vkey)); voices[vkey[k]]=x['V']
            r=round(x['start']/rd,4)
            if r>=NR: continue
            cell={'r':r,'l':round(max(0.05,(min(x['end'],L)-x['start'])/rd),4),'n':round(69+12*math.log2(x['hz']/440),2),'vo':int(vkey[k])}
            pc=[[round(s*60,2),cts] for s,cts in x['pc'] if s>0]
            if pc: cell['pc']=pc
            out.append(cell)
        cells['ch%d'%c]=out
    chans=['ch%d'%c for c in range(9) if cells.get('ch%d'%c)]
    P=json.load(open(f['patches'])); ins={}
    roles=f['roles']; role_of={v:k for k,v in roles.items()}
    for ch in chans:
        if ch in P: inst=patch_to_inst(role_of.get(ch,'arp'),P[ch],'opl2')
        else: inst={'wave':'sine','adsr':[0.002,0.1,0.3,0.05],'vol':0.12}
        inst.pop('lowPowerOff',None); ins[ch]=inst
    ins['drums']=PRESETS['opl2']['drums']
    pats={}; seen={}; order=[]
    for bar in range(NR//RPP):
        pat={ch:[{**x,'r':round(x['r']-bar*RPP,4)} for x in cells[ch] if bar*RPP<=x['r']<bar*RPP+RPP] for ch in chans}
        pat={k:v for k,v in pat.items() if v}; kk=json.dumps(pat,sort_keys=True)
        if kk not in seen: seen[kk]='P%02d'%len(pats); pats[seen[kk]]=pat
        order.append(seen[kk])
    old=json.load(open(os.path.join(ROOT,'songs','keen-wotb.json')))
    song={'id':o['id'],'title':o['title'],'source':o.get('source',''),'format':'opl-v2','driver':'id Software IMF (560 Hz) on OPL2',
          'bpm':round(bpm,4),'rowsPerBeat':RPB,'rowsPerPattern':RPP,'ticksPerRow':6,'swing':0,'key':old.get('key','C'),'scale':old.get('scale','major'),
          'loop':True,'gainTrim':o.get('gainTrim',1),'palette':o['palette'],'instrumentSet':'opl2','arrangement':'faithful-v2','channels':chans,'roles':roles,
          'levels':{'opl':0.25},'oplDepth':{'am':4.8 if bd&0x80 else 1.0,'vib':14 if bd&0x40 else 7},'oplK':4,'voices':voices,
          'channelInfo':{ch:'OPL2 channel %s'%ch[2:] for ch in chans},'lowPowerOff':f.get('lowPowerOff',[]),
          'mix':{ch:{'vol':0,'gate':1,'bright':1,'oct':0,'mute':False,'solo':False} for ch in chans},'instruments':ins,'patterns':pats,'intro':[],'order':order}
    json.dump(song,open(os.path.join(ROOT,'songs','keen-wotb.json'),'w'),separators=(',',':'))
    info={'imfSec':round(L,3),'bpm':round(bpm,3),'rows':NR,'channels':chans,'notes':{c:len(cells[c]) for c in chans},'voices':len(voices),
          'pitchCurves':sum(1 for c in chans for x in cells[c] if 'pc' in x),'BD':hex(bd)}
    print(json.dumps(info)); json.dump(info,open(os.path.join(HERE,'keen-export-report.json'),'w'),indent=1)
main()
