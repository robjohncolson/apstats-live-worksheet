#!/usr/bin/env python3
"""Accuracy REFERENCE for the Sega songs: the SMPS driver emulation (tools/sega/smps_drv.py) produces the YM2612
register stream, which is played through the Nuked OPN2 core (libvgm copy, ./ym_ref) at 44.1 kHz; SN76489 is modelled
exactly (10-bit tone counters, 2 dB volume steps, 16-bit LFSR noise, taps 0/3); DAC drums are the ROM samples at the
driver's playback rates. Levels: YM channel full scale (TL 0 sine) = 0.261 (measured from the core, DC removed);
PSG channel full volume = 0.14 peak square; DAC full scale = 0.26.
build: gcc -O2 -I<libvgm> -o ym_ref ym_ref.c <libvgm>/emu/cores/ym3438.c -lm   (see BUILD.txt)"""
import subprocess,os,numpy as np,json,base64
HERE=os.path.dirname(os.path.abspath(__file__)); SR=44100; SPF=SR/60.0
PSG_AMP=0.14; DAC_AMP=0.26; PSGCLK=3579545
def ym(drv,f0,f1,keep=None):
    out=["w 0 34 0","w 0 39 0","w 0 43 0"]; acc=0.0; nsamp=0
    for c in range(7): out.append("w 0 40 %d"%c)
    for fr in range(f1):
        for p,r,v in drv.writes[fr]:
            if keep is not None and p==0 and r==0x28 and (v&7) not in keep: continue
            out.append("w %d %d %d"%(p,r,v))
        acc+=SPF; k=int(acc); acc-=k
        k-=len(drv.writes[fr])
        if fr>=f0: out.append("s %d"%max(0,k)); nsamp+=max(0,k)
        else: out.append("s %d"%max(0,k))
    o=subprocess.run([os.path.join(HERE,'ym_ref')],input='\n'.join(out).encode(),capture_output=True,check=True).stdout
    x=np.frombuffer(o,'<f4').reshape(-1,2).astype(float)
    # AC coupling: the core's output carries a DC bias (YM2612 DAC offset); remove it like the console's output caps (~7 Hz HP)
    from scipy.signal import lfilter
    a=1-2*np.pi*7/SR; x=lfilter([1,-1],[1,-a],x,axis=0)
    # drop pre-roll (frames before f0)
    pre=int(sum(1 for _ in range(0)))
    return x
def frame_starts(nfr):
    acc=0.0; st=[0]
    for _ in range(nfr): acc+=SPF; st.append(int(round(acc)))
    return st
def psg(drv,f1):
    st=frame_starts(f1); n=st[-1]; y=np.zeros(n); amp=lambda a:0 if a>=15 else 10**(-2*a/20)
    tclk=PSGCLK/16.0
    for ch in range(3):
        ph=0.0
        for fr in range(f1):
            N,att=drv.psg[fr][ch]; a,b=st[fr],st[fr+1]
            if att>=15 or b<=a: 
                continue
            f=PSGCLK/(32*max(1,N)); t=ph+np.arange(b-a)*f/SR; ph=(t[-1]+f/SR)%1
            y[a:b]+=amp(att)*np.where((t%1)<0.5,1.0,-1.0)
    reg=0x8000; acc=0.0; out=np.zeros(n)
    for fr in range(f1):
        mode,att=drv.psg[fr][3]; a,b=st[fr],st[fr+1]
        N3=drv.psg[fr][2][0]
        N={0:0x10,1:0x20,2:0x40,3:max(1,N3)}[mode&3]
        rate=PSGCLK/(32*N); white=mode&4; g=amp(att)
        for i in range(a,b):
            acc+=rate/SR
            while acc>=1:
                acc-=1
                fb=((reg&1)^((reg>>3)&1)) if white else (reg&1)
                reg=(reg>>1)|(fb<<15)
            out[i]=(1.0 if reg&1 else -1.0)*g if g else 0.0
    return (y+out*0.6)*PSG_AMP
def dac(drv,f1,kitfile):
    K=json.load(open(kitfile)); st=frame_starts(f1); y=np.zeros(st[-1]+SR*2)
    cache={}
    for fr in range(f1):
        for sid in drv.dac[fr]:
            m=K['ids'].get('%02X'%sid)
            if not m: continue
            key=(m['sample'],m['rate'])
            if key not in cache:
                pcm=(np.frombuffer(base64.b64decode(K['samples'][m['sample']]['pcm']),np.uint8).astype(float)-128)/128
                L=int(len(pcm)*SR/m['rate']); cache[key]=np.interp(np.arange(L)*m['rate']/SR,np.arange(len(pcm)),pcm)
            s=cache[key]; a=st[fr]
            y[a:a+len(s)]=s[:len(y)-a]          # one DAC channel: a new sample cuts the previous one
            # (cut previous tail)
            y[a+len(s):a+len(s)+1]=y[a+len(s):a+len(s)+1]
    return y[:st[-1]]*DAC_AMP
def render(drv,f0,f1,kitfile=None,parts=('fm','psg','dac'),keep=None):
    """stereo float array for frames [f0,f1) (state is built from frame 0)"""
    st=frame_starts(f1); a,b=st[f0],st[f1]
    x=ym(drv,0,f1,keep); L=min(len(x),b); mix=np.zeros((b,2))
    if 'fm' in parts: mix[:L]+=x[:L]
    m=np.zeros(b)
    if 'psg' in parts: p=psg(drv,f1); m[:len(p)]+=p[:b]
    if 'dac' in parts and kitfile:
        d=dac_cut(drv,f1,kitfile); m[:len(d)]+=d[:b]
    mix+=m[:,None]
    return mix[a:b]
def dac_cut(drv,f1,kitfile):
    K=json.load(open(kitfile)); st=frame_starts(f1); n=st[-1]; y=np.zeros(n); cache={}; hits=[]
    for fr in range(f1):
        for sid in drv.dac[fr]: hits.append((st[fr],sid))
    for i,(a,sid) in enumerate(hits):
        m=K['ids'].get('%02X'%sid)
        if not m: continue
        key=(m['sample'],m['rate'])
        if key not in cache:
            pcm=(np.frombuffer(base64.b64decode(K['samples'][m['sample']]['pcm']),np.uint8).astype(float)-128)/128
            L=int(len(pcm)*SR/m['rate']); cache[key]=np.interp(np.arange(L)*m['rate']/SR,np.arange(len(pcm)),pcm)
        s=cache[key]; end=min(n,a+len(s),hits[i+1][0] if i+1<len(hits) else n)
        y[a:end]=s[:end-a]
    return y*DAC_AMP
