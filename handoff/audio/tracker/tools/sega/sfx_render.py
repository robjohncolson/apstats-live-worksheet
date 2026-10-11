#!/usr/bin/env python3
"""Offline renderer for extracted SMPS SFX (mirrors TrackerEngine.playOriginalSfx) and the DAC sample kits.
usage: python3 sfx_render.py            -> sfx/wav/<set>/<id>_<name>.wav for every effect (check renders)
       import: render(set_json_sfx_entry, sr, semis=0) -> float32 mono"""
import json,os,sys,math,re,wave,base64,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); TR=os.path.dirname(os.path.dirname(HERE))
SR=44100
def mtof(m): return 440*2**((m-69)/12)
def adsr(tt,gate,a,d,s,r,pk):
    return np.interp(tt,[0,0.002,0.002+a,0.002+a+d,max(0.002+a+d,gate),max(0.002+a+d,gate)+r],[0,0,pk,pk*s,pk*s,0],right=0)
_noise=np.random.default_rng(7).uniform(-1,1,SR*15)
def render(fx,sr=SR,semis=0,vol=1.0):
    L=fx['frames']/60+0.6; N=int(L*sr); out=np.zeros(N); k=2**(semis/12)
    for c in fx['channels']:
        ev=c['ev']; gpv=c['gainDbPerVol']
        freq=np.zeros(N); amp=np.zeros(N); D=np.zeros(N)
        inst=c.get('inst'); fm=inst['fm'] if inst else None
        # frequency as a per-frame step function
        cur=None
        for i,(f,m,v,on) in enumerate(ev):
            i0=int(f/60*sr); i1=int(ev[i+1][0]/60*sr) if i+1<len(ev) else N
            if m is not None: cur=mtof(m)*k
            if cur: freq[i0:i1]=cur
        # note envelopes
        ons=[i for i,e in enumerate(ev) if e[3]==1 and e[1] is not None]
        for j,i in enumerate(ons):
            f0,m,v,_=ev[i]; t0=f0/60
            end=next((ev[x][0] for x in range(i+1,len(ev)) if ev[x][1] is None or ev[x][3]==1),fx['frames'])/60
            nxt=ev[ons[j+1]][0]/60 if j+1<len(ons) else L
            i0=int(t0*sr); i1=min(N,int(nxt*sr)); tt=np.arange(i1-i0)/sr; g=10**(gpv*max(0,v)/20)*vol
            if c['kind']=='fm':
                a,d,s,r=inst['adsr']; amp[i0:i1]=adsr(tt,end-t0,a,d,s,r,inst['vol']*g)
                at=max(0.001,fm.get('modAttack',0.002)); Dm=fm['index']; sus=fm.get('modSus',0.5); tc=max(0.005,fm.get('modDecay',0.3)/3)
                D[i0:i1]=np.where(tt<at,Dm*tt/at,Dm*sus+(Dm-Dm*sus)*np.exp(-np.minimum((tt-at)/tc,50)))
            else:
                lvl=(0.10 if c['kind']=='psg' else 0.12)*g
                e=lvl*(0.55+0.45*np.exp(-tt/0.12)); e[tt>=end-t0]=0; amp[i0:i1]=e
        if c['kind']=='fm':
            mod=np.sin(2*np.pi*np.cumsum(freq*fm['ratio']/sr)); out+=np.sin(2*np.pi*np.cumsum((freq+D*freq*fm['ratio']*mod)/sr))*amp
        elif c['kind']=='psg':
            out+=np.where((np.cumsum(freq/sr)%1)<0.5,1.0,-1.0)*amp
        else:
            nz=_noise[:N].copy()
            if not c.get('white',True):   # periodic noise ~ 1/16 duty pulse
                nz=np.where((np.cumsum(freq/16/sr)%1)<1/16,1.0,-0.07)
            out+=nz*amp
    return out.astype(np.float32)
def save_wav(path,x,sr=SR):
    y=np.clip(x,-1,1); 
    with wave.open(path,'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((y*32767).astype('<i2').tobytes())
if __name__=='__main__':
    for st in ('genesis-s1','genesis-s3k'):
        S=json.load(open(os.path.join(TR,'sfx',st+'.json')))['sfx']; od=os.path.join(TR,'sfx','wav',st); os.makedirs(od,exist_ok=True); pk=0
        for i,fx in S.items():
            x=render(fx); pk=max(pk,np.abs(x).max())
            save_wav(os.path.join(od,'%s_%s.wav'%(i,re.sub(r'[^A-Za-z0-9]+','-',fx['name']).strip('-'))),x)
        print(st,len(S),'wavs, max raw peak %.2f'%pk)
