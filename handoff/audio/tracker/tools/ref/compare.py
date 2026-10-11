#!/usr/bin/env python3
"""Offline render vs REFERENCE (Sega: SMPS driver emu -> Nuked OPN2 + SN76489 + DAC; Keen: IMF -> pyopl/DOSBox OPL core).
Segments: 'loop' = 40 s from the analysed loop start (same window the old previews used), 'start' = first 40 s from the
song start (includes the intro). usage: compare.py <song> [--before]  -> prints/updates tools/ref/similarity.json"""
import sys,os,json,math,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); TOOLS=os.path.dirname(HERE); ROOT=os.path.dirname(TOOLS)
sys.path[:0]=[HERE,TOOLS]
import metrics as M
SR=44100; SEG=40.0
JOBS={'starlight':'sonic1-starlight','icecap':'sonic3-icecap','launchbase':'sonic3-launchbase','mushroomhill':'sk-mushroomhill'}
def mono(x): return x.mean(1) if x.ndim>1 else x
def sega_ref(name):
    cache='/tmp/ref_full_%s.npz'%name
    if os.path.exists(cache):
        z=np.load(cache); return z['x'],z['tfs']
    import sega_songs as G, ref_render as R, faithful as F
    var,s,ev,S0,P,bpm=F.smps_song(JOBS[name]); d,kit=G.driver(JOBS[name])
    fr=int(S0/(bpm*24/3600))+int(SEG*60)+240; d.run(fr)
    x=mono(R.render(d,0,fr,os.path.join(ROOT,'samples',kit+'.json')))
    np.savez(cache,x=x,tfs=np.array(d.tfs)); return x,np.array(d.tfs)
def seg(x,t): a=int(t*SR); y=x[a:a+int(SEG*SR)]; return np.pad(y,(0,int(SEG*SR)-len(y)))
def sega(name,which):
    import faithful as F, render_v2 as RV
    var,s,ev,S0,P,bpm=F.smps_song(JOBS[name]); ref,tfs=sega_ref(name)
    tref=lambda tf:int(np.searchsorted(tfs,tf))/60.0
    out={}
    if which=='before':
        b=np.load('/tmp/before_%s.npy'%name); r=np.concatenate([np.zeros(int(0.05*SR)),seg(ref,tref(S0))])[:int(SEG*SR)]
        out['loop']=M.compare(b,r); return out
    song=json.load(open(os.path.join(ROOT,'songs',name+'.json'))); rep=json.load(open(os.path.join(TOOLS,'smps-export-report.json')))[name]
    fpr=song['framesPerRow']; rd=60/song['bpm']/song['rowsPerBeat']; S=rep['introTf']; IR=rep['introRows']
    tnew=lambda tf:((tf-S)/fpr+IR)*rd
    full=RV.render(song,tnew(S0)+SEG+1,t0=0.0,root=ROOT)
    out['loop']=M.compare(seg(full,tnew(S0)),seg(ref,tref(S0)))
    out['start']=M.compare(seg(full,tnew(0)),seg(ref,0))
    return out
if __name__=='__main__':
    name=sys.argv[1]; which='before' if '--before' in sys.argv else 'after'
    res=sega(name,which) if name in JOBS else __import__('compare_keen').keen(name,which)
    p=os.path.join(HERE,'similarity.json'); J=json.load(open(p)) if os.path.exists(p) else {}
    J.setdefault(name,{})[which]=res; json.dump(J,open(p,'w'),indent=1); print(name,which,json.dumps(res))
