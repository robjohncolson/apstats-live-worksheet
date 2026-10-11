"""Keen reference: the IMF register stream played through pyopl (DOSBox OPL2 emulation), 40 s from the song start."""
import os,sys,json,pickle,struct,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); TOOLS=os.path.dirname(HERE); ROOT=os.path.dirname(TOOLS)
sys.path[:0]=[HERE,TOOLS]
import metrics as M
SR=44100; SEG=40.0
def ref():
    p='/tmp/ref_keen.npy'
    if os.path.exists(p): return np.load(p)
    import pyopl
    ch=pickle.load(open('/workspace/parkmusic/keen5/chunks.pkl','rb'))[197]; n=struct.unpack_from('<H',ch,0)[0]
    cm=[struct.unpack_from('<BBH',ch,2+i) for i in range(0,n,4)]
    opl=pyopl.opl(SR,2,1); out=[]; acc=0.0
    def gen(k):
        while k>0:
            m=min(k,512); b=bytearray(m*2); opl.getSamples(b); out.append(np.frombuffer(bytes(b),'<i2').astype(float)/32768); k-=m
    for r,v,d in cm*2:
        opl.writeReg(r,v); acc+=d*SR/560; k=int(acc); acc-=k
        if k: gen(k)
        if sum(len(o) for o in out)>(SEG+2)*SR: break
    x=np.concatenate(out); np.save(p,x); return x
def keen(name,which):
    r=ref(); r=np.concatenate([np.zeros(int(0.05*SR)),r])[:int(SEG*SR)]
    if which=='before':
        return {'start':M.compare(np.load('/tmp/before_keen-wotb.npy'),r)}
    import render_v2 as RV
    song=json.load(open(os.path.join(ROOT,'songs','keen-wotb.json')))
    return {'start':M.compare(RV.render(song,SEG,t0=0.05),r)}
