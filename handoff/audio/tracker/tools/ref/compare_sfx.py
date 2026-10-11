#!/usr/bin/env python3
"""SFX accuracy check: each mapped original effect, reference (SMPS driver -> Nuked OPN2 + SN76489) vs
before (old 2-op frame player, sfx_render.py) vs after (real engine in headless Chrome, 4-op chip worklet + PSG envelopes).
usage: python3 compare_sfx.py s1:B5,s1:A0,...   -> per-effect similarity + sfx/similarity-sfx.json"""
import os,sys,json,struct,subprocess,wave,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); TOOLS=os.path.dirname(HERE); ROOT=os.path.dirname(TOOLS)
sys.path[:0]=[HERE,TOOLS,os.path.join(TOOLS,'sega'),'/workspace/sonic']
import metrics as M, ref_render as RR, sfx_v2 as SV, sfx_render as SR0, kos
SR=44100
def drv_for(ref):
    st,i=ref.split(':'); i=int(i,16)
    if st=='s1':
        r=open('/workspace/sonic/sonic1rev1.bin','rb').read(); hdr=struct.unpack_from('>48I',r,0x78B44)[i-0xA0]; return SV.SfxDriver(r,'s1',hdr,None,'s1')
    r=open('/workspace/sonic/knuckles.bin','rb').read(); blob=kos.kos(r,0xF7760)
    w=struct.unpack_from('<173H',blob,0x37C+2)[i-0x33]; return SV.SfxDriver(r,'s3k',0x1F*0x8000+w-0x8000,0x1F,'sk')
def main():
    refs=sys.argv[1].split(','); gap=0.6
    sets={k:json.load(open(os.path.join(ROOT,'sfx','genesis-%s.json'%k)))['sfx'] for k in ('s1','s3k')}
    out=subprocess.run(['node',os.path.join(TOOLS,'offline','render_offline.js'),'--sfx',','.join(refs),'/tmp/sfx_after.wav','--normalize=0'],capture_output=True,text=True).stdout
    info=json.loads(out.strip().splitlines()[-1])
    w=wave.open('/tmp/sfx_after.wav'); A=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(float).mean(1)/32767
    res={}
    for ref,t,name in info['at']:
        fx=sets[ref.split(':')[0]][ref.split(':')[1]]; L=fx['v2']['frames']; n=int((L/60+0.4)*SR)
        d=drv_for(ref)
        for _ in range(L+30): d.step_frame()
        R=RR.render(d,0,L+24,None,parts=('fm','psg'))
        if R.ndim>1: R=R.mean(1)
        R=R[:n]; a=A[int(t*SR):int(t*SR)+len(R)]; b=SR0.render(fx)
        if b.ndim>1: b=b.mean(1)
        b=b[:len(R)]
        if len(b)<len(R): b=np.concatenate([b,np.zeros(len(R)-len(b))])
        res[ref]={'name':name,'before':M.compare(b,R),'after':M.compare(a,R)}
        print(ref,name,'before',res[ref]['before'],'after',res[ref]['after'])
    json.dump(res,open(os.path.join(ROOT,'sfx','similarity-sfx.json'),'w'),indent=1)
main()
