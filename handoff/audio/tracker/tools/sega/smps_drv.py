#!/usr/bin/env python3
"""SMPS driver emulation (Sonic 1 68k SMPS and S3/S&K Z80 SMPS) at 60 Hz frame level.

One pass produces BOTH
  * per-note data for the tracker (start/end frame, pitch incl. detune, voice, volume, pan, note-fill, ties,
    modulation pitch curve, PSG envelope volume curve), and
  * the hardware register stream (YM2612 writes, SN76489 state, DAC triggers) that tools/ref/ref_render.py feeds to a
    real YM2612 core (Nuked OPN2) + an SN76489 model as the accuracy REFERENCE.

Implemented per driver: tempo (S1 timeout / S3K accumulator: tracks wait one extra frame), E0 pan/AMS/FMS, E1 detune,
E6/EC volume, E7 tie, E8 note fill (S1 frames, S3K frames x divider), E9/FB transpose, EF voice, F0 modulation
(wait/speed/change/steps), F1/F4 modulation on/off (S1) and S3K F1/F4 modulation envelopes, FA mod off, F3 PSG noise,
F5 PSG volume envelope (real ROM tables: S1 PSG_Index @0x719A8, S3/S&K Z80 tables), loops/calls/jumps, DAC.
"""
import struct,os
HERE=os.path.dirname(os.path.abspath(__file__))
S1P={0xE0:1,0xE1:1,0xE2:1,0xE3:0,0xE4:0,0xE5:1,0xE6:1,0xE7:0,0xE8:1,0xE9:1,0xEA:1,0xEB:1,0xEC:1,0xED:0,0xEE:0,0xEF:1,
     0xF0:4,0xF1:0,0xF2:0,0xF3:1,0xF4:0,0xF5:1,0xF6:2,0xF7:4,0xF8:2,0xF9:0}
S3P={0xE0:1,0xE1:1,0xE2:1,0xE3:0,0xE4:1,0xE5:2,0xE6:1,0xE7:0,0xE8:1,0xE9:0,0xEA:1,0xEB:3,0xEC:1,0xED:1,0xEE:2,0xEF:1,
     0xF0:4,0xF1:2,0xF2:0,0xF3:1,0xF4:1,0xF5:1,0xF6:2,0xF7:4,0xF8:2,0xF9:0,0xFA:0,0xFB:1,0xFC:2,0xFD:1,0xFE:4}
FFP={0:1,1:1,2:1,3:3,4:1,5:4,6:2,7:0}
FMTAB={'s1':[0x25E,0x284,0x2AB,0x2D3,0x2FE,0x32D,0x35C,0x38F,0x3C5,0x3FF,0x43C,0x47C],
       's3k':[0x284,0x2AB,0x2D3,0x2FE,0x32D,0x35C,0x38F,0x3C5,0x3FF,0x43C,0x47C,0x4C0]}
OPS=[1,3,2,4]; CARRIERS={0:[4],1:[4],2:[4],3:[4],4:[2,4],5:[2,3,4],6:[2,3,4],7:[1,2,3,4]}
HW={'FM1':0,'FM2':1,'FM3':2,'FM4':4,'FM5':5,'FM6':6}
YMCLK=7670453; PSGCLK=3579545
def fm_hz(fv):
    blk=(fv>>11)&7; fn=fv&0x7FF; return fn*(2**blk)*YMCLK/144/2**21
def psg_hz(N): return PSGCLK/(32*max(1,N))
def psg_period(midi):
    f=440*2**((midi-69)/12); return max(1,min(1023,round(PSGCLK/(32*f))))
def decode_voice(b):
    """25 SMPS voice bytes -> {'alg','fb','op':{1..4:{dt,mul,rs,ar,am,d1r,d2r,d1l,rr,tl}}}"""
    f=lambda base:{OPS[i]:b[base+i] for i in range(4)}
    dm,ra,dr,d2,rr,tl=f(1),f(5),f(9),f(13),f(17),f(21)
    return {'alg':b[0]&7,'fb':(b[0]>>3)&7,'op':{o:{'dt':(dm[o]>>4)&7,'mul':dm[o]&15,'rs':ra[o]>>6,'ar':ra[o]&31,'am':dr[o]>>7,
            'd1r':dr[o]&31,'d2r':d2[o]&31,'d1l':rr[o]>>4,'rr':rr[o]&15,'tl':tl[o]&127} for o in (1,2,3,4)}}
# ---------------------------------------------------------------- envelope tables from the ROMs
def env_list(raw,start,var):
    out=[]; o=start
    while len(out)<200:
        x=raw[o]; o+=1
        if x>=0x80:
            if x in (0x82,0x84): out.append(('cmd',x,raw[o])); break
            out.append(('cmd',x,0)); break
        out.append(x if var=='s1' else (x-256 if x>=0x80 else x))
    return out
def tables(var,rom):
    if var=='s1':
        ps=struct.unpack_from('>9I',rom,0x719a8)
        return {'psg':{k+1:env_list(rom,p,'s1') for k,p in enumerate(ps)},'mod':{}}
    if var=='s3':
        blob=rom[0xe7300:0xe7300+0x400]
    else:
        blob=open(os.path.join(HERE,'sk_driver_tables.bin'),'rb').read()   # S&K Z80 driver data (Kosinski-decompressed), z80 $1300
    base=0x1300; ptrs=[]; p=0x87
    while True:
        w=struct.unpack_from('<H',blob,p)[0]
        if ptrs and p+base>=min(ptrs): break
        ptrs.append(w); p+=2
    def mlist(a):
        out=[]; o=a-base
        while len(out)<200:
            x=blob[o]; o+=1
            if x in (0x80,0x81,0x83): out.append(('cmd',x,0)); break
            if x in (0x82,0x84): out.append(('cmd',x,blob[o])); break
            out.append(x-256 if x>=0x80 else x)
        return out
    psg={k+1:mlist(a) for k,a in enumerate(ptrs)}
    mod={k+1:mlist(struct.unpack_from('<H',blob,0xe+2*k)[0]) for k in range(8)}
    return {'psg':psg,'mod':mod}
# ---------------------------------------------------------------- tracks
class T:
    def __init__(s,name,kind,ptr,trans,vol,env=0,div=1):
        s.name,s.kind,s.ptr,s.trans,s.vol,s.env=name,kind,ptr,trans,vol,env
        s.stack=[]; s.loops={}; s.div=div; s.last=1; s.timeout=1; s.fill=0; s.fillcnt=0; s.tie=False; s.note=None
        s.done=False; s.noise=None; s.det=0; s.voice=None; s.pan=0xC0; s.mod=None; s.modon=False; s.modenv=0; s.modenvmul=1
        s.keyed=False; s.cur=None; s.base=None; s.envpos=0; s.envval=0; s.envstop=False; s.menvpos=0; s.alt=False; s.rest=True
class Driver:
    def __init__(s,rom,var,start,bank=None,tabvar=None,sfx=False):
        s.r=rom; s.v=var; s.start=start; s.bank=bank; s.tab=tables(tabvar or var,rom); s.unk=set()
        be='>' if var=='s1' else '<'; r=rom
        vp,nfm,npsg,div,tmp=struct.unpack_from(be+'HBBBB',r,start)
        s.vp=vp; s.div=div; s.tempo=tmp; s.tracks=[]; p=start+6
        for i in range(nfm):
            ptr,tr,vol=struct.unpack_from(be+'Hbb',r,p); p+=4
            nm=['DAC','FM1','FM2','FM3','FM4','FM5','FM6'][i]
            s.tracks.append(T(nm,'dac' if i==0 else 'fm',s.addr(ptr),0 if i==0 else tr,vol,div=div))
        for i in range(npsg):
            ptr,tr,vol,_,env=struct.unpack_from(be+'HbbBB',r,p); p+=6
            s.tracks.append(T('PSG%d'%(i+1),'psg',s.addr(ptr),tr,vol,env,div=div))
        s.frame=0; s.tf=0; s.acc=tmp; s.tout=tmp
        s.writes=[]; s.psg=[]; s.dac=[]; s.notes={t.name:[] for t in s.tracks}; s.tfs=[]
        s.noisemode=0xE7
    def addr(s,ptr): return s.start+ptr if s.v=='s1' else s.bank*0x8000+ptr-0x8000
    def jaddr(s,at):
        if s.v=='s1': return at+struct.unpack_from('>h',s.r,at)[0]+1
        return s.addr(struct.unpack_from('<H',s.r,at)[0])
    def voice_addr(s,i): return (s.start+s.vp if s.v=='s1' else s.addr(s.vp))+25*i
    def voice(s,i): return decode_voice(s.r[s.voice_addr(i):s.voice_addr(i)+25])
    # ------------------------------------------------ hardware writes
    def w(s,port,reg,val): s.fw.append((port,reg,val&0xFF))
    def fm_voice_regs(s,t):
        hw=HW[t.name]; port=hw>>2; c=hw&3; b=s.r[s.voice_addr(t.voice):s.voice_addr(t.voice)+25]; alg=b[0]&7
        s.w(port,0xB0+c,b[0])
        for i in range(4):
            for reg,base in ((0x30,1),(0x50,5),(0x60,9),(0x70,13),(0x80,17)): s.w(port,reg+4*i+c,b[base+i])
        s.fm_tl(t); s.w(port,0xB4+c,t.pan)
    def fm_tl(s,t):
        if t.voice is None: return
        hw=HW[t.name]; port=hw>>2; c=hw&3; b=s.r[s.voice_addr(t.voice):s.voice_addr(t.voice)+25]; alg=b[0]&7
        for i in range(4):
            tl=b[21+i]&127
            if OPS[i] in CARRIERS[alg]: tl=min(127,tl+max(0,t.vol))
            s.w(port,0x40+4*i+c,tl)
    def fm_key(s,t,on):
        hw=HW[t.name]; s.w(0,0x28,(0xF0 if on else 0)|hw); t.keyed=on
    def fm_freq(s,t,fv):
        hw=HW[t.name]; port=hw>>2; c=hw&3; s.w(port,0xA4+c,(fv>>8)&0x3F); s.w(port,0xA0+c,fv&0xFF)
    # ------------------------------------------------ pitch
    def base_val(s,t,note):
        idx=note-0x81+t.trans
        if t.kind=='fm':
            tab=FMTAB[s.v]; idx=max(0,idx); return ((idx//12)<<11)|tab[idx%12]
        midi=(48 if s.v=='s1' else 36)+idx; return psg_period(midi)
    def midi_of(s,t,val):
        import math
        hz=fm_hz(val) if t.kind=='fm' else psg_hz(val)
        return 69+12*math.log2(max(1e-6,hz)/440)
    # ------------------------------------------------ run
    def run(s,frames):
        for _ in range(frames): s.step_frame()
        for t in s.tracks: s.close(t)
        return s
    def step_frame(s):
        s.fw=[]; stall=False
        if s.v=='s1':
            s.tout-=1
            if s.tout==0: s.tout=s.tempo; stall=True
        else:
            s.acc+=s.tempo
            if s.acc>=256: s.acc-=256; stall=True
        s.dacf=[]
        for t in s.tracks:
            if t.done: continue
            if stall: t.timeout+=1
            t.timeout-=1
            if t.timeout==0: s.parse(t)
            else: s.update(t)
        s.writes.append(s.fw); s.dac.append(s.dacf)
        s.psg.append(s.psg_state())
        s.tfs.append(s.tf)
        if not stall: s.tf+=1
        s.frame+=1
    def psg_state(s):
        st=[(1,15)]*3; noise=(s.noisemode,15)
        for t in s.tracks:
            if t.kind!='psg' or t.done: continue
            i=int(t.name[3])-1
            att=15 if (not t.keyed or t.envstop) else max(0,min(15,t.vol+t.envval))
            if t.noise is not None and t.name=='PSG3':
                noise=(t.noise,att); st[2]=(t.cur or 1,15)
            else: st[i]=(t.cur or 1,att)
        return st+[noise]
    # per-frame update while a note holds
    def update(s,t):
        if t.kind=='dac': return
        if t.fillcnt and t.keyed:
            t.fillcnt-=1
            if t.fillcnt==0: s.note_off(t); return
        if not t.keyed: return
        val=t.base+t.det
        if t.modon and t.mod:
            m=t.mod
            if m['wait']>0: m['wait']-=1
            else:
                m['spd']-=1
                if m['spd']<=0:
                    m['spd']=m['p'][1]; m['acc']+=m['chg']; m['steps']-=1
                    if m['steps']<=0: m['steps']=m['p'][3]; m['chg']=-m['chg']
            val+=m['acc']
        if t.modenv:
            val+=s.menv(t)*t.modenvmul
        if t.kind=='psg': s.psg_env(t); s.rec_v(t)
        s.set_cur(t,val)
    def menv(s,t):
        L=s.tab['mod'].get(t.modenv)
        if not L: return 0
        if t.menvpos>=len(L): t.menvpos=0
        x=L[t.menvpos]
        if isinstance(x,tuple):
            c=x[1]
            t.menvpos=x[2] if c in (0x82,) else 0
            x=L[t.menvpos] if not isinstance(L[t.menvpos],tuple) else 0
        t.menvpos+=1; return x
    def psg_env(s,t):
        if not t.env or t.envstop: return
        L=s.tab['psg'].get(t.env)
        if not L: return
        while True:
            if t.envpos>=len(L): return
            x=L[t.envpos]
            if isinstance(x,tuple):
                c=x[1]
                if s.v=='s1' or c==0x81: return                  # hold last value
                if c==0x80: t.envpos=0; continue
                if c==0x82: t.envpos=x[2]; continue
                if c==0x83: t.envstop=True; return              # envelope ends the note (silence)
                return
            t.envval=x; t.envpos+=1; return
    def set_cur(s,t,val):
        if val==t.cur: return
        t.cur=val
        if t.kind=='fm': s.fm_freq(t,val)
        if t.notes_open is not None: t.notes_open['curve'].append((s.frame-t.notes_open['f0'],val))
    def rec_v(s,t):
        att=15 if t.envstop else max(0,min(15,t.vol+t.envval))
        if att!=getattr(t,'lastv',None) and t.notes_open is not None:
            t.notes_open['vcurve'].append((s.frame-t.notes_open['f0'],att)); t.lastv=att
    def note_off(s,t):
        if t.kind=='fm' and t.keyed: s.fm_key(t,False)
        t.keyed=False; s.close(t)
    def close(s,t):
        o=getattr(t,'notes_open',None)
        if o is not None:
            o['f1']=s.frame; o['tf1']=s.tf; s.notes[t.name].append(o); t.notes_open=None
    def parse(s,t):
        r=s.r; P=S1P if s.v=='s1' else S3P
        while True:
            b=r[t.ptr]
            if b<0xE0: break
            a=t.ptr+1
            if s.v=='s3k' and b==0xFF:
                sub=r[a]; n=1+FFP.get(sub,0)
                if sub==0: s.tempo=r[a+1]
                if sub==4:
                    for x in s.tracks: x.div=r[a+1]
                t.ptr=a+n; continue
            n=P.get(b,0); sb=struct.unpack('b',r[a:a+1])[0]
            if s.v=='s3k' and b==0xEF and r[a]&0x80: n=2
            if b==0xE0:
                t.pan=r[a]
                if t.kind=='fm': hw=HW[t.name]; s.w(hw>>2,0xB4+(hw&3),t.pan)
            elif b==0xE1: t.det=sb
            elif b==0xE6: t.vol+=sb; (s.fm_tl(t) if t.kind=='fm' else None)
            elif b==0xEC and t.kind=='psg': t.vol+=sb
            elif b==0xE7: t.tie=True
            elif b==0xE8: t.fill=r[a]
            elif b==0xEF and t.kind=='fm': t.voice=r[a]&0x7F; s.fm_voice_regs(t)
            elif b==0xF0:
                p=list(r[a:a+4]); t.modp=p; t.modon=any(p[1:3]); 
            elif b==0xF5 and t.kind=='psg': t.env=r[a]
            elif b==0xF3:
                t.noise=r[a] if (r[a]&0xE0)==0xE0 else None
                if t.noise is not None: s.noisemode=t.noise
            elif s.v=='s1':
                if b==0xE3: t.ptr=t.stack.pop(); continue
                if b==0xE9: t.trans+=sb
                if b==0xEA: s.tempo=r[a]; s.tout=r[a]
                if b==0xEB:
                    for x in s.tracks: x.div=r[a]
                if b==0xE5: t.div=r[a]
                if b==0xF1: t.modon=True
                if b==0xF4: t.modon=False
                if b==0xE4: t.vol=0
            else:
                if b==0xF9: t.ptr=t.stack.pop(); continue
                if b==0xFB: t.trans+=sb
                if b==0xE5: t.vol+=struct.unpack('b',r[a+1:a+2])[0]; (s.fm_tl(t) if t.kind=='fm' else None)
                if b==0xF1: t.modenv=r[a] if t.kind=='fm' else r[a+1]; t.modenvmul=1
                if b==0xF4: t.modenv=r[a]
                if b==0xFA: t.modon=False; t.modenv=0
                if b==0xFD: t.alt=bool(r[a])
                if b==0xEA: s.dacf.append(r[a]|0x80); s.notes['DAC'].append({'f0':s.frame,'tf0':s.tf,'id':r[a]|0x80})
                if b==0xEB:
                    idx=r[a]
                    if t.loops.get(idx,0)==1: t.loops[idx]=0; t.ptr=s.jaddr(a+1); continue
                if b==0xFC: t.ptr=s.jaddr(a); continue
                if b==0xE3: b=0xF2
            if b==0xF2:
                s.note_off(t); t.done=True; return
            if b==0xF6: t.ptr=s.jaddr(a); continue
            if b==0xF8: t.stack.append(a+2); t.ptr=s.jaddr(a); continue
            if b==0xF7:
                idx,cnt=r[a],r[a+1]
                if t.loops.get(idx,0)==0: t.loops[idx]=cnt
                t.loops[idx]-=1
                if t.loops[idx]!=0: t.ptr=s.jaddr(a+2); continue
                t.ptr=a+4; continue
            if b not in P: s.unk.add(hex(b))
            t.ptr=a+n
        # note / duration
        b=r[t.ptr]
        if b>=0x80:
            note=b; t.ptr+=1
            if r[t.ptr]<0x80: t.last=r[t.ptr]; t.ptr+=1
            t.note=note
        else:
            t.last=b; t.ptr+=1; note=t.note
        dur=t.last*t.div; tie=t.tie; t.tie=False; t.timeout=dur
        if t.kind=='dac':
            if note and note!=0x80: s.dacf.append(note); s.notes['DAC'].append({'f0':s.frame,'tf0':s.tf,'id':note})
            return
        if note is None or note==0x80:
            s.note_off(t); t.rest=True; return
        base=s.base_val(t,note)
        if tie and t.keyed:                               # E7: no new attack, pitch may change (legato)
            t.base=base
            s.set_cur(t,base+t.det+(t.mod['acc'] if (t.modon and t.mod) else 0))
            if t.notes_open is not None: t.notes_open['ties']+=1
            s.set_fill(t,dur); return
        if t.keyed: s.note_off(t)
        t.base=base; t.rest=False
        if getattr(t,'modp',None):
            p=t.modp; t.mod={'p':p,'wait':p[0],'spd':p[1],'chg':struct.unpack('b',bytes([p[2]]))[0],'steps':(p[3]//2) or 1,'acc':0}
            t.mod['p']=[p[0],p[1],p[2],p[3] or 1]
        t.menvpos=0; t.envpos=0; t.envval=0; t.envstop=False
        if t.kind=='psg': s.psg_env(t)
        t.lastv=None
        t.notes_open={'f0':s.frame,'tf0':s.tf,'base':base,'det':t.det,'voice':t.voice,'vol':t.vol,'pan':t.pan,'env':t.env,
                      'noise':t.noise if t.name=='PSG3' else None,'curve':[],'vcurve':[],'ties':0,'note':note-0x81+t.trans}
        t.cur=None; s.set_cur(t,base+t.det)
        if t.kind=='fm': s.fm_key(t,True)
        else: t.keyed=True; s.rec_v(t)
        s.set_fill(t,dur)
    def set_fill(s,t,dur):
        f=(t.fill if s.v=='s1' else t.fill*t.div) if t.fill else 0
        t.fillcnt=f if (f and f<dur) else 0
T.notes_open=None
