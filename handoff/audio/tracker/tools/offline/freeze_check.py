#!/usr/bin/env python3
"""Checks for tools/offline/freeze.js output (run automatically by freeze.js; or: python3 freeze_check.py <id>...).
 1 decoded .ogg (Chrome decodeAudioData) length == intro+loop frames, and aligned with the source render (gapless, lag 0)
 2 loop seam: step |x[loopEnd-1]-x[loopStart]| in dBFS, and the seam's 2nd-difference vs the file's own 99.9th percentile
 3 the frozen song played THROUGH THE ENGINE vs a live 40 s render: lag, spectral similarity (>= 0.99), residual
 4 frozen-through-engine across two loop wraps: click detector at each wrap (HF burst vs its neighbourhood); peaks < -3 dBFS
 5 low-power toggles mid-song (songs with a .lowpower.ogg): no click at the swaps
 6 staleness: sidecar songSha1 vs songs/<id>.json (and a mutated copy must mismatch)"""
import sys,os,json,hashlib,subprocess,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(os.path.dirname(HERE)); SR=44100
sys.path.insert(0,os.path.join(ROOT,'tools','ref')); import metrics as M
ids=sys.argv[1:]
subprocess.run(['node',os.path.join(HERE,'freeze_render_checks.js'),*ids],check=True)
C=json.load(open('/tmp/freeze_checks.json'))
def ld(f): return np.fromfile(f,'<f4').reshape(-1,2).astype(np.float64)
def db(v): return round(20*np.log10(max(v,1e-12)),1)
def d2(x,i): return np.abs(x[i]-2*x[i-1]+x[i-2]).max()          # 2nd difference at frame i (stereo max)
def click(y,t,w=0.01):
    """HF burst at time t: max 2nd-difference within +-1 ms vs the 99th percentile over the surrounding +-w*20"""
    i=int(t*SR); a=np.abs(np.diff(y[max(0,i-int(0.2*SR)):i+int(0.2*SR)],2,axis=0)).max(1)
    c=len(a)//2; loc=a[c-44:c+44].max(); ref=np.percentile(a,99.5)+1e-12; return round(float(loc/ref),2)
res={}
for id in ids:
    o=C[id]; s=o['side']; I=round(s['introSeconds']*SR); L=round(s['loopSeconds']*SR); r={}
    x=ld('/tmp/dec_%s.f32'%id); src=np.fromfile('/tmp/freeze_%s.wav'%id,'<f4',offset=44).reshape(-1,2)
    r['decodedFrames']=len(x); r['expectedFrames']=I+L
    n=min(len(x),len(src)); cc=np.correlate(x[SR:SR+4096,0],src[SR-64:SR+4096+64,0],'valid'); r['decodeLag']=int(64-np.argmax(cc))
    r['codecErrDb']=db(np.sqrt(((x[:n]-src[:n])**2).mean())/np.sqrt((src[:n]**2).mean()))
    E=I+L
    r['seamStepDb']=db(np.abs(x[E-1]-x[I]).max())
    xx=np.concatenate([x[E-2:E],x[I:I+1]]); seam2=np.abs(xx[2]-2*xx[1]+xx[0]).max()
    allp=np.percentile(np.abs(np.diff(x,2,axis=0)).max(1),99.9); r['seam2ndDiffDb']=db(seam2); r['file2ndDiff99.9pctDb']=db(allp)
    r['peakDb']=db(np.abs(x).max())
    lv=ld('/tmp/live_%s.f32'%id); fz=ld('/tmp/fz_%s.f32'%id); m=min(len(lv),len(fz))
    seg=slice(int(0.5*SR),m)
    cc=np.correlate(fz[2*SR:2*SR+8192,0],lv[2*SR-512:2*SR+8192+512,0],'valid'); r['frozenVsLiveLagFrames']=int(512-np.argmax(cc))
    r['frozenVsLive']=M.compare(fz[seg].mean(1),lv[seg].mean(1))
    fullr=np.fromfile('/tmp/freeze_full_%s.f32'%id,'<f4').reshape(-1,2).astype(np.float64)
    a1=int((0.05+s['introSeconds'])*SR); a2=a1+L; nn=min(L,int(38*SR)-a1)
    r['renderPass1VsPass2']=M.compare(fullr[a1:a1+nn].mean(1),fullr[a2:a2+nn].mean(1)) if nn>SR else None   # chip state makes passes differ
    r['introSpectralVsLive']=M.compare(fz[int(0.05*SR):a1].mean(1),lv[int(0.05*SR):a1].mean(1)) if a1-int(0.05*SR)>SR else None
    r['decodedVsSourceSpectral']=M.compare(x[:min(len(x),len(src))].mean(1),src[:min(len(x),len(src))].mean(1))
    r['frozenVsLiveResidualDb']=db(np.sqrt(((fz[seg]-lv[seg])**2).mean())/np.sqrt((lv[seg]**2).mean()))
    t0=0.05; wraps=[t0+s['introSeconds']+s['loopSeconds'],t0+s['introSeconds']+2*s['loopSeconds']]
    if s['introSeconds']>0: wraps=[t0+s['introSeconds']]+wraps
    full=np.fromfile('/tmp/freeze_full_%s.f32'%id,'<f4').reshape(-1,2).astype(np.float64)
    base=click(full,t0+s['introSeconds']+s['loopSeconds'])     # the same musical boundary where the render ran on continuously
    r['clickRatioAtWraps']=[click(fz,t) for t in wraps]; r['clickRatioNaturalBoundary']=base
    r['clickRatioMidLoopControl']=click(fz,t0+s['introSeconds']+0.5*s['loopSeconds'])
    # residual of the engine's wrapped output vs the continuous render at the first wrap (pass2->pass2 vs pass2->pass3), 0-50 ms after
    w=int(wraps[-2 if s['introSeconds']>0 else 0]*SR) if len(wraps)>1 else int(wraps[0]*SR)
    # pass-to-pass difference that is NOT due to the seam: pass1->pass2 boundary vs pass2->pass3 boundary in the continuous render
    def seg(y,i): return y[i:i+int(0.05*SR)]
    p2=int((t0+s['introSeconds']+s['loopSeconds'])*SR); p3=int((t0+s['introSeconds']+2*s['loopSeconds'])*SR)
    def rel(a,b): return db(np.sqrt(((a-b)**2).mean())/(max(np.sqrt((a**2).mean()),np.sqrt((b**2).mean()))+1e-9))
    r['wrapVsContinuous50msDb']=rel(seg(fz,p3),seg(full,p2)) if len(full)>p3 else None
    r['frozenEnginePeakDb']=db(np.abs(fz).max())
    if 'frozenToggle' in o:
        ft=ld('/tmp/fzt_%s.f32'%id); r['lowPowerToggles']={str(t):click(ft,t+0.02) for t,_ in o['toggles']}
        xl=ld('/tmp/dec_%s.lowpower.f32'%id); r['lowPowerFile']={'frames':len(xl),'seamStepDb':db(np.abs(xl[E-1]-xl[I]).max()),'peakDb':db(np.abs(xl).max())}
    sha=hashlib.sha1(open(os.path.join(ROOT,'songs',id+'.json'),'rb').read()).hexdigest()
    mut=hashlib.sha1(open(os.path.join(ROOT,'songs',id+'.json'),'rb').read()+b' ').hexdigest()
    r['sha1Fresh']=sha==s['songSha1']; r['sha1DetectsEdit']=mut!=s['songSha1']
    r['frozenFlag']=o['frozen']['frozen']; r['usesWorklet']=o['frozen']['usesWorklet']
    res[id]=r; print(id,json.dumps(r))
print('console errors:',C['errors'])
json.dump({'checks':res,'errors':C['errors']},open(os.path.join(ROOT,'frozen','freeze-check.json'),'w'),indent=1)
