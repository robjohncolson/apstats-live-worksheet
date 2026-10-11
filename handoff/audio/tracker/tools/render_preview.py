"""Offline mirror of tracker-engine.js voices (nes / genesis FM / opl2 FM) -> previews/<id>.mp3 (40 s, -4 dBFS, vibe SFX hits).
usage: python3 tools/render_preview.py <song-id>"""
import json,re,math,os,sys,subprocess,numpy as np
from scipy.signal import lfilter,butter
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
SONG_ID=sys.argv[1] if len(sys.argv)>1 else 'launchbase'
SR=44100; song=json.load(open('songs/%s.json'%SONG_ID)); INS=song['instruments']; PLAT=song.get('instrumentSet','nes')
SFX=json.loads(re.search(r'/\*SFX_JSON_START\*/(.*?)/\*SFX_JSON_END\*/',open('vibe.js').read(),re.S).group(1))
SC={'major':[0,2,4,5,7,9,11],'minor':[0,2,3,5,7,8,10],'dorian':[0,2,3,5,7,9,10],'mixolydian':[0,2,4,5,7,9,10],'pentatonic':[0,2,4,7,9]}
KEYS={'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}
DUR=40.0; N=int(DUR*SR); RPP=song['rowsPerPattern']; rd=60/song['bpm']/song['rowsPerBeat']; td=rd/song['ticksPerRow']; T0=0.05
mtof=lambda n:440*2**((n-69)/12)
cells={c:[] for c in song['channels']}; ab=0
while T0+ab*RPP*rd<DUR:
    for name in song['order']:
        P=song['patterns'][name]
        for c in cells:
            for x in P.get(c,[]): cells[c].append((T0+(ab*RPP+x['r'])*rd,x))
        ab+=1
        if T0+ab*RPP*rd>=DUR: break
def wave(name,ph,duty=0.5):
    ph=ph%1.0
    if name=='sine': return np.sin(2*np.pi*ph)
    if name=='triangle': return 4*np.abs(ph-0.5)-1
    if name=='square': return np.where(ph<0.5,1.0,-1.0)
    if name=='pulse': return np.where(ph<duty,1.0,-1.0)-(2*duty-1)
    if name=='tri4': st=np.floor(ph*32); lv=np.where(st<16,15-st,st-16); return lv/7.5-1
    s=np.sin(2*np.pi*ph)
    if name=='halfsine': return np.maximum(0,s)
    if name=='abssine': return np.abs(s)
    if name=='quartersine': return np.where(((ph*4)%2)<1,np.abs(s),0)
    return s
def amp_env(inst,tt,gate,pk):
    a,d,s,r=inst.get('adsr',[0.005,0.05,0.7,0.03])
    if inst.get('steps'):                    # 4-bit stepped, 60 Hz frames (mirrors stepEnv)
        F=1/60; frames=max(1,round(d/F)); k=np.floor(tt/F)
        x=np.where(k<frames,1-(1-s)*(k/frames),s); x=np.where(tt<gate,x,0)
        last=1-(1-s)*min(1,(math.floor(gate/F))/frames) if gate/F<frames else s
        rf=max(1,round(r/F)); kr=np.floor((tt-gate)/F)
        x=np.where(tt>=gate,np.clip(last*(1-kr/rf),0,1),x)
        return np.round(x*15)/15*pk
    return np.interp(tt,[0,0.002,0.002+a,0.002+a+d,max(0.002+a+d,gate),max(0.002+a+d,gate)+r],[0,0,pk,pk*s,pk*s,0],right=0)
def mod_env(fm,tt,D):
    at=max(0.001,fm.get('modAttack',0.002)); sus=fm.get('modSus',0.5); tc=max(0.005,fm.get('modDecay',0.3)/3)
    return np.where(tt<at,D*tt/at,D*sus+(D-D*sus)*np.exp(-(tt-at)/tc))
def voice_render(inst,notes,n_out):
    """notes: list of (t0, t1_next, gate, f, pk, fx) -> signal of length n_out (one persistent voice, like the engine)."""
    freq=np.full(n_out,1.0); gain=np.zeros(n_out); cents=np.zeros(n_out); lr=np.full(n_out,5.5); D=np.zeros(n_out)
    fm=inst.get('fm') or None
    for t,nxt,gate,f,pk,fx in notes:
        i0=int(t*SR); i1=min(n_out,int(nxt*SR))
        if i0>=n_out or i1<=i0: continue
        tt=np.arange(i1-i0)/SR; fr=np.full(len(tt),f)
        if fx and 'arp' in fx and len(fx['arp'])>1:
            k=(tt//(fx.get('arpRate',2)*td)).astype(int); offs=np.array(fx['arp']); m=tt<gate; fr[m]=f*2**(offs[k[m]%len(offs)]/12)
        freq[i0:i1]=fr; gain[i0:i1]=amp_env(inst,tt,gate,pk)
        if fm and fm.get('index',0)>0: D[i0:i1]=mod_env(fm,tt,fm['index']*f*fm['ratio'])
        if fx and 'vib' in fx:
            dep,rate,dl=fx['vib']; cents[i0:i1]=np.interp(tt,[dl,dl+0.08,gate,gate+0.02],[0,dep*100,dep*100,0],left=0,right=0); lr[i0:i1]=rate
    vib=2**(cents*np.sin(2*np.pi*np.cumsum(lr/SR))/1200); f0=freq*vib
    if fm:
        m=wave(fm.get('modWave','sine'),np.cumsum(f0*fm['ratio']/SR))
        car=wave(inst.get('wave','sine'),np.cumsum((f0+D*m)/SR))
        return (car+fm.get('addLevel',0)*m)*gain
    return wave(inst.get('wave','square'),np.cumsum(f0/SR),inst.get('duty',0.5))*gain
MIX=song.get('mix',{}); SOLO=[c for c,m in MIX.items() if m.get('solo')]
def mixg(c):
    m=MIX.get(c,{})
    if m.get('mute') or (SOLO and c not in SOLO): return 0.0
    return 10**(m.get('vol',0)/20)
def melodic(c):
    m=MIX.get(c,{}); inst=json.loads(json.dumps(INS[c])); L=cells[c]; notes=[]
    if inst.get('fm'): inst['fm']['index']*=m.get('bright',1)
    for i,(t,x) in enumerate(L):
        nxt=L[i+1][0] if i+1<len(L) else DUR
        notes.append((t,nxt,x['l']*rd*m.get('gate',1),mtof(x['n']+12*m.get('oct',0)),inst['vol']*x.get('v',1),x.get('fx',{})))
    return voice_render(inst,notes,N)*mixg(c)
_nb={}
def noise(kind,n):
    if kind not in _nb:
        if kind=='white': _nb[kind]=np.random.default_rng(3).uniform(-1,1,N+SR)
        else:
            tap=6 if kind=='lfsrShort' else 1; rate=1789773/(64 if kind=='lfsrShort' else 202); reg=1; acc=0.0; out=np.empty(SR)
            for i in range(SR):
                acc+=rate/SR
                while acc>=1: fb=(reg^(reg>>tap))&1; reg=(reg>>1)|(fb<<14); acc-=1
                out[i]=-1 if reg&1 else 1
            _nb[kind]=np.tile(out,int((N+SR)/SR)+1)
    return _nb[kind]
def filt(x,spec):
    ft=spec.get('filter','none'); tone=spec.get('tone',2000)
    if ft=='bandpass': b,a=butter(2,[tone*0.6/(SR/2),min(0.99,tone*1.6/(SR/2))],'band')
    elif ft=='highpass': b,a=butter(2,tone/(SR/2),'high')
    elif ft=='lowpass': b,a=butter(2,tone/(SR/2),'low')
    else: return x
    return lfilter(b,a,x)
def hit_env(tt,vol,dec,steps):
    if steps: return vol*np.round(15*np.clip(1-np.floor(tt/(dec/8))/8,0,1))/15*(tt<dec)
    return vol*np.exp(np.log(0.0005/vol)*np.minimum(tt/dec,1))*(tt<dec)
def drum_sound(D,n,vel,src_cache,cell=None):
    if n=='T':
        T=D.get('tom',D['kick']); f0=(cell or {}).get('f',T.get('from',180)); dec=T.get('decay',0.15); m=int(dec*SR); tt=np.arange(m)/SR
        f=f0*0.45**(tt/dec); return wave(T.get('wave','sine'),np.cumsum(f)/SR)*hit_env(tt,T.get('vol',0.6)*vel,dec,False)
    if n=='K':
        K=D['kick']; m=int(K['decay']*SR); tt=np.arange(m)/SR; f=K['from']*(K['to']/K['from'])**(tt/K['decay'])
        return wave(K.get('wave','sine'),np.cumsum(f)/SR)*hit_env(tt,K['vol']*vel,K['decay'],False)
    S=D['snare'] if n=='S' else D['hat']; m=int(max(S['decay'],0.13)*SR); tt=np.arange(m)/SR
    key=('S' if n=='S' else 'H'); src=src_cache[key]; off=np.random.default_rng(len(src_cache['used'])).integers(0,SR//2); src_cache['used'].append(1)
    s=src[off:off+m]*hit_env(tt,S['vol']*vel,S['decay'],S.get('steps',False))
    if n=='S' and S.get('body'):
        B=S['body']; f=B['f']*(0.7)**np.minimum(tt/B['decay'],1); s=s+wave('triangle',np.cumsum(f)/SR)*hit_env(tt,B['vol']*vel,B['decay'],False)
    return s
D=INS['drums']; D.setdefault('hat',{'noise':'white','filter':'highpass','tone':8000,'decay':0.03,'vol':0.0})
SRC={'S':filt(noise(D['snare'].get('noise','white'),N)[:N+SR],D['snare']),'H':filt(noise(D['hat'].get('noise','white'),N)[:N+SR],D['hat']),'used':[]}
ROLES=song.get('roles',{})
import base64
sys.path.insert(0,os.path.join(ROOT,'tools','sega')); import sfx_render
KIT=json.load(open(os.path.join(ROOT,'samples',song['drumKit']+'.json'))) if song.get('drumKit') else None
_kc={}
def kit_sample(d,vel):
    m=KIT['ids'].get(d) if KIT else None
    if not m: return None
    if d not in _kc:
        S=KIT['samples'][m['sample']]; x=np.frombuffer(base64.b64decode(S['pcm']),np.uint8).astype(float)/128-1
        n=int(len(x)*SR/m['rate']); _kc[d]=np.interp(np.arange(n)*m['rate']/SR,np.arange(len(x)),x)
    return _kc[d]*D.get('sampleVol',0.55)*vel
def drums():
    out=np.zeros(N)
    for t,x in cells.get('drums',[]):
        i0=int(t*SR)
        if i0>=N: continue
        s=kit_sample(x['d'],x.get('v',1)) if x.get('d') else None
        if s is None: s=drum_sound(D,x['n'],x.get('v',1),SRC,x); j=min(N,i0+len(s)); out[i0:j]+=s[:j-i0]
    return out
def deg2midi(deg,oct):
    sc=SC[song['scale']]; n=len(sc); o=deg//n; i=deg%n; k=KEYS[song['key']]; k=k-12 if k>6 else k
    return 60+k+sc[i]+12*(o+oct)
def sfx_notes(d):            # mirrors vibe.js sfxNotes: top note C4..C6 (bass C2..C4), sweep cap 1 octave, user offset
    notes=[None if st[2] in ('noise','kick') else deg2midi(st[0],d['oct']) for st in d['steps']]
    for grp in ('melodic','bass'):
        idx=[i for i,st in enumerate(d['steps']) if notes[i] is not None and (st[2]=='bass')==(grp=='bass')]
        if not idx: continue
        first=notes[idx[0]]
        for i in idx:
            while notes[i]>first+12: notes[i]-=12
        lo,hi=(60,84) if grp=='melodic' else (36,60); top=max(notes[i] for i in idx); sh=0
        while top+sh>hi: sh-=12
        while top+sh<lo: sh+=12
        for i in idx: notes[i]+=sh
    off=max(-12,min(12,song.get('mix',{}).get('sfx',{}).get('pitch',0)))
    return [None if n is None else n+off for n in notes]
def sfx(name,t):
    """mirrors vibe.js: one platform voice per timbre (engine.sfxVoice), drums via engine.sfxDrum"""
    ref=song.get('sfxMap',{}).get(name); mx=song.get('mix',{}).get('sfx',{})
    if ref and mx.get('original',True):
        st,i=ref.split(':'); fx=json.load(open(os.path.join(ROOT,'sfx','genesis-%s.json'%st)))['sfx'][i]
        return sfx_render.render(fx,SR,max(-12,min(12,mx.get('pitch',0))),10**(mx.get('vol',0)/20)).astype(float)
    d=SFX[name]; t32=60/song['bpm']/8; out=np.zeros(int(4*SR)); per={}; tt0=t
    NT=sfx_notes(d)
    for (deg,ln,kind),mid in zip(d['steps'],NT):
        L=ln*t32
        if kind in ('noise','kick'):
            s=drum_sound(D,'K' if kind=='kick' else 'S',1,SRC); i0=int((t-tt0)*SR); j=min(len(out),i0+len(s)); out[i0:j]+=s[:j-i0]
        else: per.setdefault(kind,[]).append((t-tt0,L,mtof(mid)))
        t+=L
    for kind,ns in per.items():
        inst=INS.get(ROLES.get(kind,kind)) or INS.get(kind) or INS[ROLES.get('lead','lead')]
        if inst.get('fm') and inst['fm']['ratio']>4:
            inst=json.loads(json.dumps(inst))
            while inst['fm']['ratio']>4: inst['fm']['ratio']/=2
            inst['fm']['index']*=0.6; pk=0.5 if kind=='bass' else 0.24
        notes=[(a,(ns[i+1][0] if i+1<len(ns) else a+L+0.3),L*0.85,f,pk,{}) for i,(a,L,f) in enumerate(ns)]
        out+=voice_render(inst,notes,len(out))
    return out
mix=np.zeros(N)
for c in song['channels']:
    if c!='drums': mix+=melodic(c)
mix+=drums()*mixg('drums'); mix*=0.27                                  # engine master (default volume)
beat=60/song['bpm']; hits=[(2,'jump'),(3,'land'),(5,'coin'),(7,'coin'),(9,'key'),(11,'ui'),(13,'door'),(15,'error'),(17.5,'jump'),(19,'stageClear')]
sx=np.zeros(N)
for bar,name in hits:
    t=T0+bar*4*beat
    if t>=DUR-1: continue
    s=sfx(name,t); i0=int(t*SR); j=min(N,i0+len(s)); sx[i0:j]+=s[:j-i0]
mix+=sx*0.48*10**(song.get('mix',{}).get('sfx',{}).get('vol',0)/20)                                             # engine.sfxOut (default)
raw=20*np.log10(np.abs(mix).max()); g=10**(-4/20)/np.abs(mix).max(); mix*=g
f=int(1.5*SR); mix[-f:]*=np.linspace(1,0,f)
os.makedirs('previews',exist_ok=True)
subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(SR),'-ac','1','-i','-','-b:a','192k','previews/%s.mp3'%SONG_ID],input=mix.astype('<f4').tobytes(),check=True)
print('%-13s %-8s raw engine-mix peak %.2f dBFS (engine output headroom), normalized to %.2f dBFS'%(SONG_ID,PLAT,raw,20*np.log10(np.abs(mix).max())))
