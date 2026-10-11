#!/usr/bin/env python3
"""Extract original SMPS sound effects from Robert's ROMs into frame-level data for tracker-engine.js.
S1 REV01: SoundIndex @0x78B44 ($A0-$CF, big-endian, pointers relative to the header).
S&K (final S3K driver): SFX pointer table in the Kosinski driver data @0xF7760 (+0x37C), $33-$DF, data in z80 bank 0x1F.
Each SFX -> channels [{kind:'fm'|'psg'|'noise', ch, inst (2-op voice from the SMPS patch), ev:[[frame, midiFloat|null, gainDb, keyon]...]}]
Approximations: modulation (F0) and detune are applied in register units; PSG volume envelopes (F5) are not applied
(a short default decay is used); S3K F1/F4 modulation envelopes are treated as on/off.
usage: python3 sfx_extract.py   (writes ../../sfx/genesis-s1.json, genesis-s3k.json)"""
import struct,json,os,sys,math
HERE=os.path.dirname(os.path.abspath(__file__)); TR=os.path.dirname(os.path.dirname(HERE)); SON='/workspace/sonic'
sys.path.insert(0,os.path.join(TR,'tools')); sys.path.insert(0,SON)
from faithful import decode,two_op
import kos
S1P={0xE0:1,0xE1:1,0xE2:1,0xE3:0,0xE4:0,0xE5:1,0xE6:1,0xE7:0,0xE8:1,0xE9:1,0xEA:1,0xEB:1,0xEC:1,0xED:0,0xEE:0,0xEF:1,
     0xF0:4,0xF1:0,0xF2:0,0xF3:1,0xF4:0,0xF5:1,0xF6:2,0xF7:4,0xF8:2,0xF9:0}
S3P={0xE0:1,0xE1:1,0xE2:1,0xE3:0,0xE4:1,0xE5:2,0xE6:1,0xE7:0,0xE8:1,0xE9:0,0xEA:1,0xEB:3,0xEC:1,0xED:1,0xEE:2,0xEF:1,
     0xF0:4,0xF1:2,0xF2:0,0xF3:1,0xF4:1,0xF5:1,0xF6:2,0xF7:4,0xF8:2,0xF9:0,0xFA:0,0xFB:1,0xFC:2,0xFD:1,0xFE:4}
FNUM=[0x25E,0x284,0x2AB,0x2D3,0x2FE,0x32D,0x35C,0x38F,0x3C5,0x3FF,0x43C,0x47C]
S1NAMES={0xA0:'Jump',0xA1:'Lamppost (checkpoint)',0xA3:'Death',0xA4:'Skid',0xA6:'Hit spikes (hurt)',0xA7:'Push block',
 0xA8:'SS goal',0xA9:'SS item',0xAA:'Splash',0xAC:'Hit boss',0xAD:'Bubble',0xAE:'Fireball',0xAF:'Shield',0xB0:'Saw',
 0xB1:'Electric',0xB2:'Drown death',0xB3:'Flamethrower',0xB4:'Bumper',0xB5:'Ring',0xB6:'Spikes move',0xB7:'Rumbling',
 0xB9:'Collapse',0xBA:'SS glass',0xBB:'Door',0xBC:'Teleport',0xBD:'Chain stomp',0xBE:'Roll',0xBF:'Get continue',
 0xC0:'Basaran flap',0xC1:'Break item',0xC2:'Drown warning',0xC3:'Giant ring',0xC4:'Bomb',0xC5:'Cash register',
 0xC6:'Ring loss',0xC7:'Chain rising',0xC8:'Burning',0xC9:'Hidden bonus',0xCA:'Enter special stage',0xCB:'Wall smash',
 0xCC:'Spring',0xCD:'Switch',0xCE:'Ring (left speaker)',0xCF:'Signpost'}
class Ch:
    def __init__(s,cid,ptr,tr,vol):
        s.cid=cid; s.ptr=ptr; s.tr=tr; s.vol=vol; s.stack=[]; s.loops={}; s.dur=1; s.note=None; s.timeout=1
        s.done=False; s.tie=False; s.fill=0; s.det=0; s.mod=None; s.modon=False; s.noise=None; s.voice=None; s.ev=[]
        s.on=False; s.offat=None; s.mo=0
    @property
    def kind(s):
        if s.cid in (0x80,0xA0,0xC0): return 'psg'
        if s.cid==0xE0: return 'noise'
        return 'fm'
def run(r,var,base,mult,chans,maxf=60*12):
    be='>' if var=='s1' else '<'; P=S1P if var=='s1' else S3P
    def jaddr(at):
        if var=='s1': return at+struct.unpack_from('>h',r,at)[0]+1
        return 0x1F*0x8000+struct.unpack_from('<H',r,at)[0]-0x8000
    for f in range(maxf):
        alive=False
        for c in chans:
            if c.done: continue
            alive=True
            c.timeout-=1
            if c.timeout==0: step(c,r,var,P,jaddr,f,mult)
            elif c.on and c.offat is not None and f>=c.offat: c.on=False; c.ev.append([f,None,0,0])
            modstep(c,f)
        if not alive: return f
    return maxf
def pitch(c,var,note):
    if c.kind=='fm': return (11 if var=='s1' else 12)+note-0x81+c.tr
    return (48 if var=='s1' else 36)+note-0x81+c.tr
def emit(c,f,keyon):
    if c.note is None or not c.on: return
    m=c.note; off=c.det+c.mo
    if c.kind=='fm':
        k=int(m)%12; fn=FNUM[k]; m=m+12*math.log2(max(1,fn+off)/fn)
    else:
        hz=440*2**((m-69)/12); N=3579545/(32*hz); m=m+12*math.log2(N/max(1,N+off))
    c.ev.append([f,round(m,3),c.vol,1 if keyon else 0])
def modstep(c,f):
    if not (c.on and c.modon and c.mod): return
    M=c.mod
    if M['wait']>0: M['wait']-=1; return
    M['spd']-=1
    if M['spd']>0: return
    M['spd']=M['p'][1] or 1
    if M['steps']==0: M['steps']=M['p'][3]; M['chg']=-M['chg']
    M['steps']-=1; c.mo+=M['chg']; emit(c,f,False)
def step(c,r,var,P,jaddr,f,mult):
    sb=lambda a:struct.unpack('b',r[a:a+1])[0]
    while True:
        b=r[c.ptr]; a=c.ptr+1
        if b>=0xE0:
            if var=='s3k' and b==0xFF: c.ptr=a+1+{0:1,1:1,2:1,3:3,4:1,5:4,6:2,7:0}.get(r[a],0); continue
            n=P.get(b,0)
            if b==0xE1: c.det=sb(a)
            if b==0xE6: c.vol+=sb(a)
            if b==0xEC: c.vol+=sb(a)
            if b==0xE8: c.fill=r[a]
            if b==0xE7: c.tie=True
            if b==0xEF:
                c.voice=r[a]&0x7F if var=='s3k' else r[a]
                if var=='s3k' and r[a]&0x80: n=2
            if b==0xF0: c.mod={'p':[r[a],r[a+1],sb(a+2),r[a+3]],'wait':r[a],'spd':r[a+1] or 1,'chg':sb(a+2),'steps':r[a+3]//2}; c.modon=True
            if b==0xF3: c.noise=r[a]
            if var=='s1':
                if b==0xF1: c.modon=True
                if b==0xF4: c.modon=False
                if b==0xE9: c.tr+=sb(a)
                if b==0xE3: c.ptr=c.stack.pop(); continue
            else:
                if b==0xF4: c.modon=bool(r[a])
                if b==0xF1: c.modon=True
                if b==0xFA: c.modon=False
                if b==0xFB: c.tr+=sb(a)
                if b==0xE3: b=0xF2
                if b==0xF9: c.ptr=c.stack.pop(); continue
                if b==0xEB:
                    idx=r[a]
                    if c.loops.get(idx,0)==1: c.loops[idx]=0; c.ptr=jaddr(a+1); continue
                if b==0xFC: c.ptr=jaddr(a); continue
            if b==0xF2:
                c.done=True
                if c.on: c.on=False; c.ev.append([f,None,0,0])
                return
            if b==0xF6: c.ptr=jaddr(a); continue
            if b==0xF8: c.stack.append(a+2); c.ptr=jaddr(a); continue
            if b==0xF7:
                idx,cnt=r[a],r[a+1]
                if c.loops.get(idx,0)==0: c.loops[idx]=cnt
                c.loops[idx]-=1
                if c.loops[idx]!=0: c.ptr=jaddr(a+2); continue
                c.ptr=a+4; continue
            c.ptr=a+n; continue
        if b>=0x80:
            note=b; c.ptr+=1
            if r[c.ptr]<0x80: c.dur=r[c.ptr]; c.ptr+=1
        else:
            note=c.note_raw if hasattr(c,'note_raw') else None; c.dur=b; c.ptr+=1
        c.note_raw=note
        dur=c.dur*mult; tie=c.tie; c.tie=False
        if note is None or note==0x80:
            if c.on: c.on=False; c.ev.append([f,None,0,0])
            c.note=None
        else:
            c.note=pitch(c,var,note)
            if not tie:
                c.mo=0
                if c.mod:
                    p=c.mod['p']; c.mod.update(wait=p[0],spd=p[1] or 1,chg=p[2],steps=p[3]//2)
            c.on=True; emit(c,f,not tie)
            c.offat=f+c.fill*mult if c.fill and c.fill*mult<dur else None
        c.timeout=dur
        return
def inst_from(r,addr):
    p=decode(r,addr); t=two_op(p)
    return {'wave':'sine','fm':{'ratio':min(8,max(0.5,t['ratio'])),'index':t['index'],'modAttack':t.get('modAttack',0.002),
            'modDecay':min(3,max(0.02,t['modDecay'])),'modSus':max(0.05,min(1,t['modSus'])),'modWave':t['modWave']},
            'adsr':[min(0.3,t['adsr'][0]),max(0.03,min(2,t['adsr'][1])),max(0.1,min(1,t['adsr'][2])),max(0.02,min(0.6,t['adsr'][3]))],
            'vol':0.3,'from':'SMPS voice alg %d fb %d'%(p['alg'],p['fb'])}
def extract(var,r,ptrs,ids,names):
    out={}
    for sid,hdr in zip(ids,ptrs):
        be='>' if var=='s1' else '<'
        vp,mult,n=struct.unpack_from(be+'HBB',r,hdr); chans=[]
        vbase=hdr+vp if var=='s1' else 0x1F*0x8000+vp-0x8000
        for i in range(n):
            fl,cid,ptr,tr,vol=struct.unpack_from(be+'BBHbb',r,hdr+4+6*i)
            addr=hdr+ptr if var=='s1' else 0x1F*0x8000+ptr-0x8000
            chans.append(Ch(cid,addr,tr,vol))
        L=run(r,var,hdr,mult,chans)
        cl=[]
        for c in chans:
            if not c.ev: continue
            d={'kind':c.kind,'ch':'%02X'%c.cid,'ev':c.ev}
            if c.kind=='fm':
                try: d['inst']=inst_from(r,vbase+25*(c.voice or 0))
                except Exception: d['inst']={'wave':'sine','fm':{'ratio':1,'index':1,'modDecay':0.2,'modSus':0.5},'adsr':[0.002,0.3,0.6,0.05],'vol':0.3}
                d['gainDbPerVol']=-0.75
            else:
                d['gainDbPerVol']=-2.0
                if c.kind=='noise' or (c.cid==0xC0 and c.noise is not None and (c.noise&0xE0)==0xE0):
                    d['kind']='noise'; d['white']=bool((c.noise or 0)&4); d['useTone3']=((c.noise or 0)&3)==3
            cl.append(d)
        out['%02X'%sid]={'id':'%02X'%sid,'name':names.get(sid,'SFX %02X'%sid),'frames':L,'channels':cl}
    return out
def s1():
    r=open(os.path.join(SON,'sonic1rev1.bin'),'rb').read()
    ptrs=struct.unpack_from('>48I',r,0x78B44); return extract('s1',r,ptrs,range(0xA0,0xD0),S1NAMES)
def s3k(names):
    r=open(os.path.join(SON,'knuckles.bin'),'rb').read(); blob=kos.kos(r,0xF7760)
    ws=struct.unpack_from('<173H',blob,0x37C+2); ptrs=[0x1F*0x8000+w-0x8000 for w in ws]
    return extract('s3k',r,ptrs,range(0x33,0x33+173),names)
if __name__=='__main__':
    N3=json.load(open(os.path.join(HERE,'s3k_names.json'))) if os.path.exists(os.path.join(HERE,'s3k_names.json')) else {}
    N3={int(k,16):v for k,v in N3.items()}
    for name,data in (('genesis-s1',s1()),('genesis-s3k',s3k(N3))):
        json.dump({'set':name,'framesPerSecond':60,'sfx':data},open(os.path.join(TR,'sfx',name+'.json'),'w'),separators=(',',':'))
        print(name,len(data),'effects',os.path.getsize(os.path.join(TR,'sfx',name+'.json')),'bytes')
