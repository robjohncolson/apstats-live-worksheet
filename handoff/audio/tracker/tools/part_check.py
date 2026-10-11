#!/usr/bin/env python3
"""Faithful-notes check per PART (bass | lead | drums) for all five songs -- generalises tools/bass_check.py.
melodic parts: reference notes from the source (SMPS driver YM2612 $28 key-ons + A0/A4 freq for FM, the driver's PSG note
events + SN76489 state for PSG, IMF OPL2 key-ons for Keen, the score for Park Bounce), with the approved noteRules
(IceCap PSG1 bell fold) applied to the expectation. Checked within +-1 source tick and +-50 cents against (a) the export,
(b) the chip key-on/off log incl. keyed duration (gate) vs the reference duration (+-1 tick), (c) soloed real-engine
audio, normal and lowPower.
drums: SMPS DAC triggers (sample id per frame), PSG3 noise notes (noise mode byte), Keen IMF ch5/ch6, Park Bounce kit
(score 36/38; 42 hats are the documented faithful-arrangement drop). Checked against the export, the engine's drum log
(DAC sample id + rate, or the synth substitute in lowPower), the chip log for noise (mode byte), and audio onsets.
usage: python3 tools/part_check.py <bass|lead|drums> [ids...] [--no-audio] [--json out.json]"""
import sys,os,json,math,subprocess,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import bass_check as B
SR=44100
ALL=['launchbase','icecap','mushroomhill','keen-wotb','park-bounce']
_drv={}
def sega(id,S):
    if id in _drv: return _drv[id]
    import faithful as F, sega_songs as G, smps_export as X
    job=B.CFG[id]['faithful']['job']; var,s0,ev,S0,P,bpm=F.smps_song(job); d,kit=G.driver(job)
    d.run(int((S0+2*P)/(bpm*24/60/60))+600); Sx=X.intro_start(d,S0,P)
    RPB=S['rowsPerBeat']; fpr=24/RPB; IR=math.ceil(Sx/fpr); rd=60/S['bpm']/RPB
    _drv[id]=dict(d=d,var=var,Sx=Sx,IR=IR,fpr=fpr,rd=rd,END=Sx+P,tick=rd/fpr,T=lambda tf:((tf-Sx)/fpr+IR)*rd); return _drv[id]
def rules(id,ch):
    return B.CFG[id].get('faithful',{}).get('noteRules',{}).get(ch,[])
def apply_rules(id,ch,ref):
    for r in ref:
        for ru in rules(id,ch):
            if r['midi']>=ru['minNote']-0.5: r['midi']=round(r['midi']+ru.get('shift',0),2); r['ruled']=True
    return ref
# ------------------------------------------------------------------ melodic references
def ref_melodic(id,S,ch):
    fmt=S.get('format')
    if fmt=='smps-v2' and ch.startswith('FM'):
        B.bass_ch=lambda _id,ch=ch: ch; ref,tick,src=B.ref_sega(id,S)
        E=sega(id,S)['END']; T=sega(id,S)['T']
        for r in ref: r['dur']=min(r['dur'],T(E)-r['t'])          # the export ends the last note at the loop end
        return apply_rules(id,ch,ref),tick,src
    if fmt=='smps-v2':                                            # PSG tone channel: driver note events, verified on the SN76489 state
        import smps_drv as D
        g=sega(id,S); d=g['d']; i=int(ch[3])-1; out=[]; bad=0
        for n in d.notes[ch]:
            if n['tf0']>=g['END']: continue
            hz=D.psg_hz(n['base']+n['det']); fr=n['f0']
            N,att=d.psg[fr][i]
            if not (N==n['base']+n['det'] or att>=15): bad+=1      # hardware period must equal the note's period while sounding
            out.append({'t':g['T'](n['tf0']),'midi':round(69+12*math.log2(hz/440),2),'dur':(min(n['tf1'],g['END'])-n['tf0'])/g['fpr']*g['rd'],'tick':n['tf0']})
        ref_melodic.hwMismatch=bad
        return apply_rules(id,ch,out),g['tick'],'SMPS driver PSG note events (+SN76489 period check), '+ch
    if fmt=='opl-v2':
        import io,contextlib
        with contextlib.redirect_stdout(io.StringIO()): import keen_export as K
        notes,L,bd=K.build(); NR=B.CFG[id]['faithful']['bars']*16; rd=L/NR; c=int(ch[2:])
        return [{'t':x['start'],'midi':round(69+12*math.log2(x['hz']/440),2),'dur':x['end']-x['start'],'ghost':x['V']['car']['tl']>=60}
                for x in notes[c] if x['start']/rd<NR],1/560,'IMF OPL2 key-on, '+ch
    sc=json.load(open(B.CFG[id]['src'])); rd=60/S['bpm']/S['rowsPerBeat']; trk={'lead':'lead','bass':'bass'}[ch]
    L=sorted(sc['tracks'][trk]); out=[]
    for k,(a,d,p,v) in enumerate(L):
        if out and abs(out[-1]['t']-a)<1e-9: out[-1].setdefault('chord',[]).append(p); continue   # simultaneous notes on a mono channel
        out.append({'t':a,'midi':p,'dur':d})
    return out,rd/6,'score-v2 %s track'%trk
# ------------------------------------------------------------------ melodic check
def check_melodic(id,part,audio=True):
    S=B.song(id); ch=S['roles'][part] if part!='bass' else B.CFG[id].get('faithful',{}).get('roles',{}).get('bass','bass')
    if id=='park-bounce': ch=part
    ref,tick,src=ref_melodic(id,S,ch); ex,L=B.exported(S,ch); tol=tick+1e-6
    out={'part':part,'channel':ch,'source':src,'ref':len(ref),'tick_ms':round(tick*1000,2),'ghost':sum(1 for r in ref if r.get('ghost')),
         'ruled':sum(1 for r in ref if r.get('ruled')),'chordsInSource':sum(1 for r in ref if r.get('chord'))}
    if getattr(ref_melodic,'hwMismatch',None) is not None: out['psgHwMismatch']=ref_melodic.hwMismatch; ref_melodic.hwMismatch=None
    fe=B.match(ref,ex,tol); out['export']=sum(fe)
    out['exportMissing']=[(round(r['t'],3),r['midi']) for r,f in zip(ref,fe) if not f][:10]
    # durations (export, gate included): within 1 tick of the reference duration
    import bisect; ts=[e['t'] for e in ex]
    def dur_err(got,key):
        errs=[]
        gt=[g['t'] for g in got]
        for r in ref:
            i=bisect.bisect_left(gt,r['t']-tol); best=None
            while i<len(got) and got[i]['t']<=r['t']+tol:
                if abs(got[i]['midi']-r['midi'])<=0.5 and (best is None or abs(got[i]['t']-r['t'])<abs(best['t']-r['t'])): best=got[i]
                i+=1
            if best is not None: errs.append(abs(best[key]-r['dur']))
        return errs
    de=dur_err(ex,'dur'); out['exportDurWithin1Tick']=sum(1 for e in de if e<=tol); out['exportDurMaxErrTicks']=round(max(de)/tick,3) if de else None
    if S.get('format') in ('smps-v2','opl-v2'):
        kl=B.keylog(id,ch,L+0.6); alive=[k for k in kl if k['keyed']>=0.003]   # >= 3 ms (Keen has 2-tick = 3.6 ms notes in the IMF)
        fk=B.match(ref,alive,tol); out['keylog']=sum(fk); out['keylogCut']=sum(1 for k in kl if k['keyed']<0.003)
        out['keylogMissing']=[(round(r['t'],3),r['midi']) for r,f in zip(ref,fk) if not f][:10]
        kd=dur_err(kl,'keyed'); out['keyedDurWithin1Tick']=sum(1 for e in kd if e<=tol); out['keyedDurMaxErrTicks']=round(max(kd)/tick,3) if kd else None
    if audio:
        for tag,o in (('audio',{'solo':ch}),('audioLowPower',{'solo':ch,'lowPower':True})):
            x,info=B.render(id,L+0.6,**o); fa=B.audio_found(x,ref,tol)
            out[tag+'Pitch']=sum(B.audio_found(x,ref,tol,attack=False))   # pitch sounding in the note (legato retriggers have no audible attack)
            out[tag]=sum(fa); out[tag+'Missing']=[(round(r['t'],3),r['midi']) for r,f in zip(ref,fa) if not f][:10]; out[tag+'Errors']=info['errs']
        if S.get('format')=='smps-v2' and ch.startswith('FM'):
            B.bass_ch=lambda _id,ch=ch: ch; xo,ro,_=B.original_audio(id,S); fo=B.audio_found(xo,ro,tol,t0=0)
            out['originalAudio']=sum(fo); out['audioMatchesOriginal']=sum(1 for a_,b_ in zip(fa_ if False else B.audio_found(B.render(id,L+0.6,solo=ch)[0],ref,tol),fo) if a_==b_)
    return out
# ------------------------------------------------------------------ drums
def render_log(id,dur,**o):
    js="""const p=require('/workspace/trackertools/node_modules/puppeteer-core');(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:0,args:['--no-sandbox','--allow-file-access-from-files']});
const g=await b.newPage();const errs=[];g.on('pageerror',e=>errs.push(e.message));g.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await g.goto('file://%s/tools/offline/offline.html');const r=await g.evaluate((id,d,o)=>window.renderSong(id,d,o),%s,%s,%s);
require('fs').writeFileSync('/tmp/part_render.f32',Buffer.from(r.f32,'base64'));require('fs').writeFileSync('/tmp/part_log.json',JSON.stringify(r.log||[]));console.log(JSON.stringify({errs}));await b.close();})();"""%(B.ROOT,json.dumps(id),dur,json.dumps({'float':True,'log':True,**o}))
    open('/tmp/part_render.js','w').write(js)
    info=json.loads(subprocess.run(['node','/tmp/part_render.js'],capture_output=True,text=True,check=True).stdout.strip().splitlines()[-1])
    return np.fromfile('/tmp/part_render.f32','<f4').reshape(-1,2).mean(1).astype(np.float64),json.load(open('/tmp/part_log.json')),info['errs']
def onsets_found(x,ref,tol,t0=0.05):
    env=np.sqrt(np.convolve(x**2,np.ones(88)/88,'same')+1e-20); res=[]
    for r in ref:
        a=int((r['t']+t0)*SR); w=int((tol+0.004)*SR)
        pre=env[max(0,a-w-int(0.004*SR)):a+1]; post=env[max(0,a-w):a+w+int(0.008*SR)]
        res.append(bool(len(pre) and len(post) and post.max()>1.25*pre.min() and post.max()>1e-4))
    return res
def check_drums(id,audio=True):
    S=B.song(id); fmt=S.get('format'); out={'part':'drums'}; rd=60/S['bpm']/S['rowsPerBeat']
    if fmt=='smps-v2':
        import faithful as F
        g=sega(id,S); d=g['d']; tol=g['tick']+1e-6
        ref=[{'t':g['T'](d.tfs[fr]),'id':'%02X'%i,'midi':0} for fr,L in enumerate(d.dac) for i in L if d.tfs[fr]<g['END']]
        Lsec=sum((S['patterns'][n].get('rows') or S['rowsPerPattern']) for n in (S.get('intro') or [])+S['order'])*rd
        exd=[]; row=0
        for name in (S.get('intro') or [])+S['order']:
            P=S['patterns'][name]
            for c in P.get('drums',[]): exd.append({'t':(row+c['r'])*rd,'id':c.get('d'),'n':c['n']})
            row+=P.get('rows') or S['rowsPerPattern']
        def m(ref,got,key):
            got=sorted(got,key=lambda x:x['t']); used=set(); fl=[]
            for r in ref:
                j=next((j for j,x in enumerate(got) if j not in used and abs(x['t']-r['t'])<=tol and x[key]==r[key]),None)
                if j is not None: used.add(j)
                fl.append(j is not None)
            return fl
        fe=m(ref,exd,'id'); out.update({'dacRef':len(ref),'tick_ms':round(g['tick']*1000,2),'dacExport':sum(fe),'dacExportMissing':[(round(r['t'],3),r['id']) for r,f in zip(ref,fe) if not f][:10]})
        # noise channel (PSG3 with a noise mode byte)
        nref=[{'t':g['T'](n['tf0']),'nz':n['noise'],'midi':0} for n in d.notes.get('PSG3',[]) if n['tf0']<g['END'] and n.get('noise') is not None]
        hwbad=sum(1 for n in d.notes.get('PSG3',[]) if n['tf0']<g['END'] and n.get('noise') is not None and d.psg[n['f0']][3][0]!=n['noise'])
        exn=[]; row=0
        for name in (S.get('intro') or [])+S['order']:
            P=S['patterns'][name]
            for c in P.get('PSG3',[]): exn.append({'t':(row+c['r'])*rd,'nz':c.get('nz')})
            row+=P.get('rows') or S['rowsPerPattern']
        fn=m(nref,exn,'nz'); out.update({'noiseRef':len(nref),'noiseHwModeMismatch':hwbad,'noiseExport':sum(fn)})
        if nref:
            o=subprocess.run(['node',os.path.join(HERE,'bass_log.js'),os.path.join(B.ROOT,'songs',id+'.json'),str(Lsec+0.6),'PSG3'],capture_output=True,text=True,check=True).stdout
            kl=[{'t':t,'nz':nz,'keyed':k if k is not None else 9} for t,_,f,k,nz in json.loads(o)]
            fk=m(nref,[k for k in kl if k['keyed']>=0.004],'nz'); out['noiseKeylog']=sum(fk)
            out['noiseKeylogMissing']=[(round(r['t'],3),r['nz']) for r,f in zip(nref,fk) if not f][:10]
        if audio:
            for tag,lp in (('',False),('LowPower',True)):
                x,log,errs=render_log(id,Lsec+0.6,solo='drums',lowPower=lp)
                if not lp:
                    got=[{'t':e[1]-0.05,'id':e[2]} for e in log if e[0]=='dac']; fl=m(ref,got,'id')
                    out['dacEngineLog']=sum(fl); out['dacEngineLogMissing']=[(round(r['t'],3),r['id']) for r,f in zip(ref,fl) if not f][:10]
                else:
                    want=[{**r,'n':F.dac_drum(g['var'] if g['var']=='s1' else 's3k',int(r['id'],16)) or 'K'} for r in ref]
                    got=[{'t':e[1]-0.05,'n':e[2]} for e in log if e[0]=='syn']; fl=m(want,got,'n')
                    out['dacLowPowerSynth']=sum(fl); out['dacLowPowerSynthMissing']=[(round(r['t'],3),r['n']) for r,f in zip(want,fl) if not f][:10]
                fa=onsets_found(x,ref,tol); out['dacAudio'+tag]=sum(fa); out['dacAudio'+tag+'Errors']=errs
                if nref:
                    xn,_=B.render(id,Lsec+0.6,solo='PSG3',lowPower=lp); fa=onsets_found(xn,nref,tol); out['noiseAudio'+tag]=sum(fa)
        return out
    if fmt=='opl-v2':
        res={}
        for ch in ('ch5','ch6'):
            r=check_melodic.__wrapped__(id,ch,audio) if hasattr(check_melodic,'__wrapped__') else None
        for ch in ('ch5','ch6'):
            S['roles']={**S['roles'],'_d':ch}
            res[ch]=check_melodic_ch(id,ch,audio)
        return {'part':'drums','channels':res}
    # park bounce: NES kit from the score (36 kick, 38 snare; 42 hats = documented faithful drop)
    sc=json.load(open(B.CFG[id]['src'])); tol=rd/6+1e-6
    ref=[{'t':a,'n':'K' if p==36 else 'S','midi':0} for a,d_,p,v in sorted(sc['tracks']['drum']) if p in (36,38)]
    hats=sum(1 for x in sc['tracks']['drum'] if x[2]==42)
    exd=[]; row=0
    for name in S['order']:
        P=S['patterns'][name]
        for c in P.get('drums',[]): exd.append({'t':(row+c['r'])*rd,'n':c['n']})
        row+=P.get('rows') or S['rowsPerPattern']
    def m(ref,got):
        used=set(); fl=[]
        for r in ref:
            j=next((j for j,x in enumerate(got) if j not in used and abs(x['t']-r['t'])<=tol and x['n']==r['n']),None)
            if j is not None: used.add(j)
            fl.append(j is not None)
        return fl
    out.update({'ref':len(ref),'hatsInScoreDroppedByArrangement':hats,'export':sum(m(ref,exd))})
    if audio:
        for tag,lp in (('',False),('LowPower',True)):
            x,log,errs=render_log(id,row*rd+0.6,solo='drums',lowPower=lp)
            got=[{'t':e[1]-0.05,'n':e[2]} for e in log if e[0]=='syn']; out['engineLog'+tag]=sum(m(ref,got))
            out['audio'+tag]=sum(onsets_found(x,ref,tol)); out['audio'+tag+'Errors']=errs
    return out
def check_melodic_ch(id,ch,audio):
    S=B.song(id); S['roles']=dict(S['roles']); S['roles']['_x']=ch
    old=B.song; B.song=lambda _i,S=S: S
    try:
        # reuse the melodic path with an explicit channel
        ref,tick,src=ref_melodic(id,S,ch); ex,L=B.exported(S,ch); tol=tick+1e-6
        out={'ref':len(ref),'ghost':sum(1 for r in ref if r.get('ghost')),'export':sum(B.match(ref,ex,tol))}
        kl=B.keylog(id,ch,L+0.6); out['keylog']=sum(B.match(ref,[k for k in kl if k['keyed']>=0.003],tol))
        if audio:
            for tag,lp in (('audio',False),('audioLowPower',True)):
                x,info=B.render(id,L+0.6,solo=ch,lowPower=lp); out[tag]=sum(onsets_found(x,[r for r in ref],tol)); out[tag+'Errors']=info['errs']
        return out
    finally: B.song=old
if __name__=='__main__':
    a=sys.argv[1:]; part=a[0]; ids=[x for x in a[1:] if not x.startswith('--') and not x.endswith('.json')] or ALL
    res={}
    for id in ids:
        res[id]=check_drums(id,'--no-audio' not in a) if part=='drums' else check_melodic(id,part,'--no-audio' not in a)
        print(id,json.dumps(res[id]),flush=True)
    if '--json' in a: json.dump(res,open(a[a.index('--json')+1],'w'),indent=1)
