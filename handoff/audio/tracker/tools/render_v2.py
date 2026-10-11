"""Offline render of v2 songs = the engine's own ChipDSP (node tools/render_chip.js) + DAC drum samples; stereo."""
import json,os,subprocess,base64,tempfile,numpy as np
SR=44100; HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
def timeline(song,dur,t0=0.05,skip_intro=False):
    rd=60/song['bpm']/song['rowsPerBeat']; RPP=song['rowsPerPattern']; seq=[] if skip_intro else list(song.get('intro',[]))
    cells={c:[] for c in song['channels']}; t=t0; k=0; order=song['order']
    while t<dur:
        name=seq[k] if k<len(seq) else order[(k-len(seq))%len(order)]; P=song['patterns'][name]
        for c in cells:
            for x in P.get(c,[]): cells[c].append((t+x['r']*rd,x))
        t+=P.get('rows',RPP)*rd; k+=1
    return cells,rd
def render(song,dur,t0=0.05,skip_intro=False,root=ROOT,stereo=False,extra=()):
    n=int(round(dur*SR))
    with tempfile.TemporaryDirectory() as td:
        sp=os.path.join(td,'s.json'); json.dump(song,open(sp,'w')); op=os.path.join(td,'o.f32')
        subprocess.run(['node',os.path.join(HERE,'render_chip.js'),sp,str(dur),op,'--t0=%g'%t0]+(['--skip-intro'] if skip_intro else [])+list(extra),check=True)
        x=np.fromfile(op,'<f4').astype(float).reshape(-1,2)[:n]
    MIX=song.get('mix',{}); solo=[c for c,m in MIX.items() if m.get('solo')]; L=song.get('levels',{})
    m=MIX.get('drums',{}); g=0 if (m.get('mute') or (solo and 'drums' not in solo)) else 10**(m.get('vol',0)/20)
    cells,rd=timeline(song,dur,t0,skip_intro)
    if song.get('drumKit') and cells.get('drums') and g:
        K=json.load(open(os.path.join(root,'samples',song['drumKit']+'.json'))); cache={}; y=np.zeros(n)
        for t,c in sorted(cells['drums'],key=lambda a:a[0]):
            mm=K['ids'].get(c.get('d'))
            if not mm: continue
            if c['d'] not in cache:
                S=K['samples'][mm['sample']]; p=np.frombuffer(base64.b64decode(S['pcm']),np.uint8).astype(float)/128-1
                cache[c['d']]=np.interp(np.arange(int(len(p)*SR/mm['rate']))*mm['rate']/SR,np.arange(len(p)),p)
            s=cache[c['d']]; a=int(t*SR); e=min(n,a+len(s))
            if a<n: y[a:e]+=s[:e-a]*L.get('dac',0.26)*c.get('v',1)
        x=x+y[:,None]*g
    x=x*0.27*song.get('gainTrim',1)
    return x if stereo else x.mean(1)
