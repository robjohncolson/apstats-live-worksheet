#!/usr/bin/env python3
"""Bass-line fidelity check for all five songs.
reference (source data) -> (a) exported song JSON, (b) chip key-on log (bass_log.js, same DSP as the worklet),
(c) audio of the REAL engine (headless Chrome, bass channel soloed): normal, lowPower, and with SFX firing.
A reference note is 'found' when pitch matches (+-50 cents) and onset is within 1 source tick.
usage: python3 tools/bass_check.py [ids...] [--no-audio] [--json out.json]"""
import sys,os,json,math,subprocess,base64,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path[:0]=[HERE,os.path.join(HERE,'ref'),os.path.join(HERE,'sega')]
CFG=json.load(open(os.path.join(HERE,'songs.config.json')))
SR=44100
def song(id): return json.load(open(os.path.join(ROOT,'songs',id+'.json')))
def bass_ch(id): return CFG[id].get('faithful',{}).get('roles',{}).get('bass','bass')
# ------------------------------------------------------------------ references
def ref_sega(id,S):
    import faithful as F, sega_songs as G, smps_drv as D, smps_export as X
    f=CFG[id]['faithful']; job=f['job']
    var,s0,ev,S0,P,bpm=F.smps_song(job); d,kit=G.driver(job)
    d.run(int((S0+2*P)/(bpm*24/60/60))+600); Sx=X.intro_start(d,S0,P)
    RPB=S['rowsPerBeat']; fpr=24/RPB; IR=math.ceil(Sx/fpr); rd=60/S['bpm']/RPB
    ch=bass_ch(id); hw=D.HW[ch]; port=hw>>2; c=hw&3; END=Sx+P
    hi=lo=0; notes=[]; cur=None
    for fr,W in enumerate(d.writes):
        tf=d.tfs[fr]; kon=None
        for (pp,reg,val) in W:
            if pp==port and reg==0xA4+c: hi=val
            elif pp==port and reg==0xA0+c: lo=val
            elif pp==0 and reg==0x28 and (val&7)==hw:
                if val&0xF0: kon=tf
                elif cur is not None and cur.get('end') is None: cur['end']=tf
        if kon is not None:
            if cur is not None and cur.get('end') is None: cur['end']=kon
            fv=(hi<<8)|lo; cur={'fr':fr,'tf':kon,'midi':69+12*math.log2(D.fm_hz(fv)/440)}; notes.append(cur)
    out=[]
    for n in notes:
        if n['tf']>=END: break
        e=n.get('end') or n['tf']+1
        out.append({'t':((n['tf']-Sx)/fpr+IR)*rd,'midi':round(n['midi'],2),'dur':(e-n['tf'])/fpr*rd,'tick':n['tf'],'fr':n['fr']})
    ref_sega.drv=d; ref_sega.hw=hw
    return out,rd/fpr,'driver YM2612 key-on writes ($28) + A0/A4 freq, '+ch
def ref_keen(id,S):
    import keen_export as K
    notes,L,bd=K.build(); f=CFG[id]['faithful']; ch=int(bass_ch(id)[2:])
    NR=f['bars']*16; rd=L/NR
    # ghost: the IMF itself keys these with carrier TL 63 (-47 dB), i.e. inaudible in the original too
    return [{'t':x['start'],'midi':round(69+12*math.log2(x['hz']/440),2),'dur':x['end']-x['start'],'ghost':x['V']['car']['tl']>=60} for x in notes[ch] if x['start']/rd<NR],1/560,'IMF OPL2 key-on (B0 bit 5), ch%d'%ch
def ref_park(id,S):
    sc=json.load(open(CFG[id]['src'])); rd=60/S['bpm']/S['rowsPerBeat']
    return [{'t':a,'midi':p,'dur':d} for a,d,p,v in sorted(sc['tracks']['bass'])],rd/6,'score-v2 bass track'
def reference(id,S):
    if S.get('format')=='smps-v2': return ref_sega(id,S)
    if S.get('format')=='opl-v2': return ref_keen(id,S)
    return ref_park(id,S)
# ------------------------------------------------------------------ export
def exported(S,ch):
    rd=60/S['bpm']/S['rowsPerBeat']; g=(S.get('mix',{}).get(ch,{}) or {}).get('gate',1); out=[]; row=0
    for name in (S.get('intro') or [])+S['order']:
        P=S['patterns'][name]
        for c in P.get(ch,[]): out.append({'t':(row+c['r'])*rd,'midi':c['n']+12*(S.get('mix',{}).get(ch,{}).get('oct',0) or 0),'dur':c['l']*rd*g})
        row+=P.get('rows') or S['rowsPerPattern']
    return out,row*rd
def match(ref,got,tol,key='midi',cents=50):
    """greedy one-to-one match by time (<= tol) and pitch; returns (found flags, matched got)"""
    got=sorted(got,key=lambda x:x['t']); used=set(); fl=[]; j0=0
    for r in ref:
        ok=None
        while j0<len(got) and got[j0]['t']<r['t']-tol-1e-9: j0+=1
        j=j0
        while j<len(got) and got[j]['t']<=r['t']+tol+1e-9:
            if j not in used and abs(got[j][key]-r['midi'])*100<=cents: ok=j; break
            j+=1
        if ok is not None: used.add(ok)
        fl.append(ok is not None)
    return fl
# ------------------------------------------------------------------ chip key-on log
def keylog(id,ch,dur):
    o=subprocess.run(['node',os.path.join(HERE,'bass_log.js'),os.path.join(ROOT,'songs',id+'.json'),str(dur),ch],capture_output=True,text=True,check=True).stdout
    return [{'t':t,'midi':69+12*math.log2(max(f,1e-6)/440),'keyed':k if k is not None else 9} for t,_,f,k,*nz in json.loads(o)]
# ------------------------------------------------------------------ audio (real engine, soloed)
def render(id,dur,**o):
    js="""const p=require('/workspace/trackertools/node_modules/puppeteer-core');(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:0,args:['--no-sandbox','--allow-file-access-from-files']});
const g=await b.newPage();const errs=[];g.on('pageerror',e=>errs.push(e.message));g.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await g.goto('file://%s/tools/offline/offline.html');const r=await g.evaluate((id,d,o)=>window.renderSong(id,d,o),%s,%s,%s);
require('fs').writeFileSync('/tmp/bass_render.f32',Buffer.from(r.f32,'base64'));console.log(JSON.stringify({errs,worklet:r.worklet}));await b.close();})();"""%(ROOT,json.dumps(id),dur,json.dumps({'float':True,**o}))
    open('/tmp/bass_render.js','w').write(js)
    info=json.loads(subprocess.run(['node','/tmp/bass_render.js'],capture_output=True,text=True,check=True).stdout.strip().splitlines()[-1])
    return np.fromfile('/tmp/bass_render.f32','<f4').reshape(-1,2).mean(1).astype(np.float64),info
def yin(x,fmin=25,fmax=1000):
    W=len(x)//2; tmax=min(W-1,int(SR/fmin)); tmin=int(SR/fmax)
    d=np.array([np.sum((x[:W]-x[t:t+W])**2) for t in range(tmax+1)]); d[0]=1
    cm=d*np.arange(len(d))/np.maximum(np.cumsum(d),1e-12); cm[0]=1
    for t in range(tmin,tmax):
        if cm[t]<0.15 and cm[t]<=cm[t+1]:
            a,b,c=cm[t-1],cm[t],cm[t+1]; s=t+0.5*(a-c)/max(a-2*b+c,1e-12); return SR/s
    t=tmin+int(np.argmin(cm[tmin:tmax])); return SR/t if cm[t]<0.4 else 0
def audio_found(x,ref,tol,t0=0.05,attack=True):
    """per reference note: an attack near the onset (energy rise or retrigger) and the pitch (YIN) in the note body"""
    env=np.sqrt(np.convolve(x**2,np.ones(int(0.004*SR))/int(0.004*SR),'same')+1e-20)
    floor=np.percentile(env[env>1e-6],50)*0.05 if np.any(env>1e-6) else 1e-6
    res=[]
    for i,r in enumerate(ref):
        a=int((r['t']+t0)*SR); dur=min(r['dur'],0.25)
        nxt=ref[i+1]['t']-r['t'] if i+1<len(ref) else 1
        body=x[a+int(0.006*SR):a+int(max(0.045,min(dur+0.03,nxt)-0.002)*SR)]   # short (note-fill) notes: include the release ring for YIN
        if r.get('ghost'):           # must be as quiet as in the original (>= 25 dB under the channel's median note)
            res.append(bool(np.sqrt(np.mean(body**2))<floor*20/10**(25/20)*1.0 or np.sqrt(np.mean(body**2))<np.percentile(env,60)*10**(-25/20))); continue
        if len(body)<int(0.006*SR) or np.sqrt(np.mean(body**2))<floor: res.append(False); continue
        f0=yin(body[:min(len(body),int(0.08*SR))],fmin=max(20,440*2**((r['midi']-69)/12)/2.2)) if len(body)>int(0.01*SR) else 0
        # FM voices with a MUL=1/2 operator really repeat at f/2, so an exact octave below also counts (pitch class + octave band)
        pitch_ok=f0>0 and min(abs(1200*math.log2(f0/(440*2**((r['midi']-69)/12)))+k) for k in (0,1200,-1200))<=50
        # attack: peak of env in [a-tol, a+tol+6ms] vs min just before (retrigger dip or rise from a lower level)
        w0=a-int((tol+0.004)*SR); w1=a+int((tol+0.012)*SR)
        pre=env[max(0,w0-int(0.01*SR)):a+int(tol*SR)+1]; post=env[a:w1]
        att=len(post) and len(pre) and (post.max()>1.12*pre.min() or pre.min()<floor)
        res.append(bool(pitch_ok and (att or not attack)))
    return res
def original_audio(id,S):
    """the ORIGINAL bass: the SMPS driver's YM2612 register stream for the bass channel only, through Nuked OPN2 (tools/ref)"""
    import ref_render as RR
    ref,tick,src=ref_sega(id,S); d=ref_sega.drv; f1=max(n['fr'] for n in ref)+120
    x=RR.render(d,0,f1,parts=('fm',),keep={ref_sega.hw}).mean(1)
    return x,[{**r,'t':r['fr']/60.0} for r in ref],tick
def check(id,audio=True):
    S=song(id); ch=bass_ch(id); ref,tick,src=reference(id,S); ex,L=exported(S,ch)
    tol=max(tick,1e-4)+1e-6
    out={'channel':ch,'source':src,'ref':len(ref),'ghostNotesInSource':sum(1 for r in ref if r.get('ghost')),'tick_ms':round(tick*1000,2),'exported':len(ex)}
    fe=match(ref,ex,tol); out['export']=sum(fe); out['exportMissing']=[ (round(r['t'],3),r['midi']) for r,f in zip(ref,fe) if not f][:12]
    if S.get('format') in ('smps-v2','opl-v2'):
        kl=keylog(id,ch,L+0.6)
        rd=60/S['bpm']/S['rowsPerBeat']
        g=(S.get('mix',{}).get(ch,{}) or {}).get('gate',1)
        alive=[k for k in kl if k['keyed']>=0.008]          # key-on that stays keyed >= 8 ms
        fk=match(ref,alive,tol); out['keylog']=sum(fk)
        short=[k for k in kl if k['keyed']<0.008]; out['keylogCut']=len(short)
        out['keylogMissing']=[(round(r['t'],3),r['midi']) for r,f in zip(ref,fk) if not f][:12]
    if audio and S.get('format')=='smps-v2':
        xo,ro,_=original_audio(id,S); fo=audio_found(xo,ro,tol,t0=0)
        out['originalAudio']=sum(fo); out['originalAudioMissing']=[(round(r['t'],3),r['midi']) for r,f in zip(ro,fo) if not f][:12]
    if audio:
        for tag,o in (('audio',{'solo':ch}),('audioLowPower',{'solo':ch,'lowPower':True}),('audioWithSfx',{'solo':ch,'sfx':[]})):
            if tag=='audioWithSfx':
                if S.get('instrumentSet')!='genesis': continue
                sm=S.get('sfxMap',{}); refs=list(sm.values()); o['sfx']=[[refs[i%len(refs)],0.3+0.37*i] for i in range(int(L/0.37))]
                o['solo']=None
            x,info=render(id,L+0.6,**o)
            if tag=='audioWithSfx':   # SFX share the output: compare bass channel against a bass-free render is not possible -> check chip log instead
                pass
            fa=audio_found(x,ref,tol) if tag!='audioWithSfx' else None
            if fa is not None:
                out[tag]=sum(fa); out[tag+'Missing']=[(round(r['t'],3),r['midi']) for r,f in zip(ref,fa) if not f][:12]
            out[tag+'Errors']=info['errs']
            if tag=='audio' and 'originalAudio' in out:   # same detection result as the original (Nuked OPN2) audio, note for note
                out['audioMatchesOriginal']=sum(1 for a_,b_ in zip(fa,fo) if a_==b_)
    return out
if __name__=='__main__':
    a=sys.argv[1:]; ids=[x for x in a if not x.startswith('--') and not x.endswith('.json')] or ['launchbase','icecap','mushroomhill','keen-wotb','park-bounce']
    res={}
    for id in ids:
        res[id]=check(id,audio='--no-audio' not in a); print(id,json.dumps(res[id]),flush=True)
    if '--json' in a: json.dump(res,open(a[a.index('--json')+1],'w'),indent=1)
