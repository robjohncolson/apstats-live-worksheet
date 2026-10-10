#!/usr/bin/env python3
"""Arrange a 4-stem SCORE (lead/bass/arp/drum, [startSec,durSec,midi,vel]) into an APStat Park tracker song.

usage: arrange.py SRC OUT [--opts JSON | --opts-file FILE]
SRC: a .js file containing `var SCORE = {...};` or a .json with {bpm, loopSeconds, tracks}.
opts (all optional):
  id, title, source            metadata
  palette {bg,fg,accent,accent2,hud}
  rowsPerBeat (4)              4 = 16th grid, 6 = 16th-triplet grid
  key, scale                   override key detection (Krumhansl over lead+bass+harmony)
  leadJson {path, channel}     replace the lead stem with an exported channel ([[t,d,midi],...] in seconds)
  padJson  {path, channel}     use an exported sustained line as the pad (else: chord 3rd/5th pad)
  swing (0), leadDuty (0.125), vibBeats (1.5), trillBeats (3)
  platform ('nes'|'genesis'|'opl2')  -> song.instrumentSet; picks the voice presets below
  patches {path, key?}         per-stem FM patch data (sonic/out/fm-patches.json[key] or keen5/opl-patches.json),
                               mapped onto the 2-op voice; stems without a patch keep the platform preset
"""
import json,re,math,sys,argparse
from collections import Counter
NAMES='C C# D D# E F F# G G# A A# B'.split()
MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]; MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
SCALES={'major':[0,2,4,5,7,9,11],'minor':[0,2,3,5,7,8,10],'dorian':[0,2,3,5,7,9,10],'mixolydian':[0,2,4,5,7,9,10]}
def load_score(p):
    t=open(p).read()
    m=re.search(r'var SCORE = (\{.*\});',t,re.S)
    return json.loads(m.group(1) if m else t)
def corr(a,b):
    ma=sum(a)/12; mb=sum(b)/12
    return sum((x-ma)*(y-mb) for x,y in zip(a,b))/math.sqrt(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b))
# ---- platform voice presets (shared contract with tracker-engine.js and render_preview.py) ----
PRESETS={
 'nes':{
  'drums':{'kick':{'wave':'tri4','from':180,'to':50,'decay':0.09,'vol':0.8},
           'snare':{'noise':'lfsrLong','filter':'none','tone':0,'decay':0.11,'vol':0.32,'steps':True},
           'hat':{'noise':'lfsrShort','filter':'highpass','tone':6000,'decay':0.03,'vol':0.14,'steps':True}},
  'bass':{'wave':'tri4','adsr':[0.001,0.05,1.0,0.02],'vol':0.6},
  'pad':{'wave':'pulse','duty':0.5,'adsr':[0.06,0.3,0.6,0.25],'vol':0.08,'steps':True,'lowPowerOff':True},
  'arp':{'wave':'pulse','duty':0.25,'adsr':[0.001,0.08,0.6,0.03],'vol':0.09,'steps':True},
  'lead':{'wave':'pulse','duty':0.125,'adsr':[0.001,0.12,0.6,0.05],'vol':0.2,'steps':True}},
 'genesis':{
  'drums':{'kick':{'wave':'sine','from':220,'to':48,'decay':0.12,'vol':0.95},
           'snare':{'noise':'white','filter':'bandpass','tone':2200,'decay':0.13,'vol':0.4,'body':{'f':190,'decay':0.07,'vol':0.35}},
           'hat':{'noise':'white','filter':'highpass','tone':9000,'decay':0.025,'vol':0.16}},
  'lead':{'wave':'sine','fm':{'ratio':1,'index':3.0,'modAttack':0.002,'modDecay':0.25,'modSus':0.45,'modWave':'sine'},'adsr':[0.004,0.4,0.7,0.08],'vol':0.26},   # brass
  'bass':{'wave':'sine','fm':{'ratio':1,'index':4.0,'modAttack':0.001,'modDecay':0.06,'modSus':0.15,'modWave':'sine'},'adsr':[0.002,0.3,0.55,0.05],'vol':0.55}, # slap
  'arp':{'wave':'sine','fm':{'ratio':3.5,'index':2.0,'modAttack':0.001,'modDecay':0.15,'modSus':0.1,'modWave':'sine'},'adsr':[0.002,0.25,0.4,0.08],'vol':0.12},   # EP/bell
  'pad':{'wave':'sine','fm':{'ratio':1,'index':0.6,'modAttack':0.2,'modDecay':1.0,'modSus':0.8,'modWave':'sine'},'adsr':[0.3,0.5,0.7,0.5],'vol':0.11,'lowPowerOff':True}},
 'opl2':{
  'drums':{'kick':{'wave':'sine','from':130,'to':55,'decay':0.16,'vol':0.8},
           'snare':{'noise':'white','filter':'lowpass','tone':3500,'decay':0.1,'vol':0.3,'body':{'f':220,'decay':0.06,'vol':0.25}},
           'hat':{'noise':'white','filter':'highpass','tone':7000,'decay':0.04,'vol':0.1}},
  'lead':{'wave':'sine','fm':{'ratio':2,'index':1.2,'modAttack':0.002,'modDecay':0.3,'modSus':0.5,'modWave':'sine'},'adsr':[0.01,0.3,0.8,0.06],'vol':0.26},   # flute/organ
  'bass':{'wave':'sine','fm':{'ratio':1,'index':0.8,'modAttack':0.002,'modDecay':0.4,'modSus':0.5,'modWave':'sine'},'adsr':[0.003,0.4,0.6,0.05],'vol':0.55},
  'arp':{'wave':'sine','fm':{'ratio':2,'index':1.0,'modAttack':0.002,'modDecay':0.2,'modSus':0.3,'modWave':'sine'},'adsr':[0.003,0.3,0.4,0.06],'vol':0.12},
  'pad':{'wave':'sine','fm':{'ratio':1,'index':0.4,'modAttack':0.2,'modDecay':1.0,'modSus':0.8,'modWave':'sine'},'adsr':[0.25,0.5,0.7,0.4],'vol':0.11,'lowPowerOff':True}}}
SUS_FLOOR={'lead':0.35,'pad':0.5,'arp':0.2,'bass':0.25}
def patch_to_inst(stem,p,platform):
    base=json.loads(json.dumps(PRESETS[platform][stem]))
    if p.get('psg'): return {**base,'wave':'square','fm':None,'adsr':[0.002,0.1,0.75,0.04],'vol':base['vol']*0.8,'from':'%s (SN76489 PSG square)'%p['channel']}
    f=p['fm']; pf=base['fm']
    fm={'ratio':min(8,max(0.5,f['ratio'])),'index':round(max(f['index'],pf['index']*0.5),3),
        'modAttack':f.get('modAttack',0.002),'modDecay':min(3,max(0.02,f.get('modDecay',0.3))),'modSus':max(0.05,min(1,f.get('modSus',0.5))),
        'modWave':f.get('modWave','sine'),'addLevel':f.get('addLevel',0)}
    a,d,s,r=f['adsr']
    base.update(wave=f.get('carWave','sine'),fm=fm,adsr=[min(0.4,a),max(0.05,min(2,d)),max(SUS_FLOOR[stem],min(1,s)),max(0.03,min(0.8,r))])
    base['from']=('SMPS voice %02X on %s (alg %d, fb %d)'%(p['voice'],p['channel'],f['alg'],f['fb'])) if 'voice' in p else ('OPL ch %d regs %s'%(p['oplChannel'],' '.join(p['regs'])))
    return base
def instruments_for(o):
    plat=o.get('platform','nes'); ins=json.loads(json.dumps(PRESETS[plat]))
    if plat=='nes': ins['lead']['duty']=o.get('leadDuty',0.125)
    if o.get('patches'):
        P=json.load(open(o['patches']['path'])); P=P[o['patches']['key']] if o['patches'].get('key') else P
        for stem,p in P.items():
            if stem in ins: ins[stem]=patch_to_inst(stem,p,plat)
    return plat,ins
def arrange(src,o):
    bpm=src['bpm']; L=src['loopSeconds']; T=dict(src['tracks'])
    RPB=o.get('rowsPerBeat',4); RPP=RPB*4; row=60/bpm/RPB; NR=round(L/row); BARS=NR//RPP
    assert abs(NR*row-L)<1e-3 and NR%RPP==0, 'loop is not a whole number of bars'
    if o.get('leadJson'):
        j=json.load(open(o['leadJson']['path'])); T['lead']=[[a,d,p,0.9] for a,d,p in j['channels'][o['leadJson']['channel']]]
    padline=None
    if o.get('padJson'):
        j=json.load(open(o['padJson']['path'])); padline=j['channels'][o['padJson']['channel']]
    R=lambda t:round(t/row,3)
    # key
    h=[0]*12
    for k in ('lead','bass','arp'):
        for s,d,p,v in T[k]: h[p%12]+=d
    best=max((corr(h,[prof[(i-t)%12] for i in range(12)]),t,m) for t in range(12) for m,prof in (('major',MAJ),('minor',MIN)))
    key=o.get('key',NAMES[best[1]]); scale=o.get('scale',best[2]); kpc=NAMES.index(key)
    cells={c:[] for c in ('drums','bass','pad','arp','lead')}
    vibR=o.get('vibBeats',1.5)*RPB; trR=o.get('trillBeats',3)*RPB
    lead=sorted(T['lead'])
    for i,(s,d,p,v) in enumerate(lead):
        r=R(s); l=R(d); fx={}
        if l>=vibR: fx['vib']=[0.25,5.5,0.12]
        if l>=trR: fx['arp']=[0,12]; fx['arpRate']=3
        gate=round(min(l*0.85,l-0.15),3) if l<vibR else round(l*0.9,3)
        cells['lead'].append({'r':r,'n':p,'l':max(0.25,gate),'v':0.9,**({'fx':fx} if fx else {})})
    def bass_at(t):
        c=[p for s,d,p,v in T['bass'] if s<=t+1e-6]; return c[-1] if c else None
    # chords per beat: harmony stem pitch classes; fallback = diatonic triad on the bass note
    beats=NR//RPB; chord=[]; fb=0
    sc=SCALES.get(scale,SCALES['major'])
    for b in range(beats):
        t0,t1=b*RPB*row,(b+1)*RPB*row
        pcs=Counter(p%12 for s,d,p,v in T['arp'] if t0-1e-6<=s<t1)
        if len(pcs)>=2: chord.append(tuple(sorted(pcs)))
        else:
            bn=bass_at(t0+1e-4)
            if bn is None: chord.append(chord[-1] if chord else None); continue
            deg=min(range(7),key=lambda i:min((bn-kpc-sc[i])%12,(kpc+sc[i]-bn)%12))
            chord.append(tuple(sorted({(kpc+sc[(deg+j)%7])%12 for j in (0,2,4)}))); fb+=1
    for i in range(len(chord)):
        if chord[i] is None: chord[i]=next((c for c in chord if c),(kpc,))
    # bass: bounce root/octave on every 8th
    step=RPB//2
    for r in range(0,NR,step):
        n=bass_at(r*row)
        if n is None: continue
        while n>=52: n-=12
        up=(r//step)%2==1
        cells['bass'].append({'r':r,'n':n+(12 if up else 0),'l':round(step*0.7,3),'v':0.8 if up else 0.95})
    # arp: one cell per beat cycling chord tones every 2 ticks (1/48 at 4 rows/beat)
    pad_prev=None
    for b,ch in enumerate(chord):
        root=72+ch[0] if 72+ch[0]<79 else 60+ch[0]
        offs=sorted({(pc-ch[0])%12 for pc in ch})[:4]
        cells['arp'].append({'r':b*RPB,'n':root,'l':RPB,'v':0.35,'fx':{'arp':offs,'arpRate':2}})
        if padline is None:
            if ch!=pad_prev:
                tone=sorted(ch,key=lambda pc:abs(((pc-ch[0])%12)-4))[0]
                cells['pad'].append({'r':b*RPB,'n':60+tone if 60+tone<67 else 48+tone,'l':RPB,'v':0.5}); pad_prev=ch
            else: cells['pad'][-1]['l']+=RPB
    if padline is not None:
        for s,d,p in padline:
            while p>72: p-=12
            cells['pad'].append({'r':R(s),'n':p,'l':max(0.5,round(R(d)*0.95,3)),'v':0.55})
    for s,d,p,v in T['drum']:
        r=int(round(s/row))
        if r<NR: cells['drums'].append({'r':r,'n':{36:'K',38:'S',42:'H'}[p],'v':round(v,2)})
    pats={}; order=[]; seen={}
    for bar in range(BARS):
        pat={c:[{**x,'r':round(x['r']-bar*RPP,3)} for x in cells[c] if bar*RPP<=x['r']<bar*RPP+RPP] for c in cells}
        kk=json.dumps(pat,sort_keys=True)
        if kk not in seen: seen[kk]='P%02d'%len(pats); pats[seen[kk]]=pat
        order.append(seen[kk])
    song={'id':o.get('id','song'),'title':o.get('title','Untitled'),'source':o.get('source',''),
      'bpm':round(bpm,4),'rowsPerBeat':RPB,'rowsPerPattern':RPP,'ticksPerRow':6 if RPB==4 else 4,'swing':o.get('swing',0),
      'key':key,'scale':scale,'loop':True,'palette':o.get('palette',{'bg':'#222222','fg':'#eeeeee','accent':'#ff9900','accent2':'#3399ff','hud':'#333333'}),
      'instrumentSet':instruments_for(o)[0],'instruments':instruments_for(o)[1],
      'channels':['drums','bass','pad','arp','lead'],'patterns':pats,'order':order}
    info=dict(key=key,scale=scale,bpm=round(bpm,3),bars=BARS,rows=NR,patterns=len(pats),lead=len(cells['lead']),
              fallbackChordBeats=fb,offgridLead=sum(1 for x in cells['lead'] if x['r']!=int(x['r'])))
    return song,info
if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--opts'); ap.add_argument('--opts-file')
    a=ap.parse_args(); o=json.loads(a.opts) if a.opts else (json.load(open(a.opts_file)) if a.opts_file else {})
    song,info=arrange(load_score(a.src),o)
    json.dump(song,open(a.out,'w'),separators=(',',':')); print(a.out,json.dumps(info))
