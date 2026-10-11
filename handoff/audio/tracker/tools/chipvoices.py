"""numpy mirror of the accurate chip voices in tracker-engine.js (makeFM4 / makeOPL2 / makePSG, ymEnv/oplEnv, fbWave).
Same breakpoint envelopes, same FM-for-PM realisation (modulator -> gain(K*f_i) -> carrier frequency), same feedback
wave (simulated, 47 harmonics), same detune/curve handling. Used by render_preview.py and the reference comparison."""
import numpy as np,math
SR=44100; FLOOR=1e-5; KPM=8*math.pi; OPL_KPM=4*math.pi
YM_ALG={0:[(1,2),(2,3),(3,4)],1:[(1,3),(2,3),(3,4)],2:[(1,4),(2,3),(3,4)],3:[(1,2),(2,4),(3,4)],4:[(1,2),(3,4)],5:[(1,2),(1,3),(1,4)],6:[(1,2)],7:[]}
YM_CAR={0:[4],1:[4],2:[4],3:[4],4:[2,4],5:[2,3,4],6:[2,3,4],7:[1,2,3,4]}
DT_TAB=[[0]*32,[0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,8,8],
        [1,1,1,1,2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,9,10,11,12,13,14,16,16,16,16],
        [2,2,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8,8,9,10,11,12,13,14,16,17,19,20,22,22,22,22]]
def ym_keycode(f):
    x=f*144*2097152/7670453; blk=0
    while x>0x4C4 and blk<7: x/=2; blk+=1
    fn=int(round(x)); f11=(fn>>10)&1; f8=(fn>>7)&7
    return (blk<<2)|(f11<<1)|((1 if f8 else 0) if f11 else (1 if f8==7 else 0))
def ym_t96(R):
    if R<=0: return math.inf
    k=R>>2; m=R&3; shift=max(0,11-k); inc=(4+m)/8*2**max(0,k-11)
    return 1024/(17755.7/2**shift*inc)
def ym_rate(r,kc,rs): return min(63,2*r+(kc>>(3-rs))) if r else 0
def trunc_release(segs,gate,trfun):
    out=[]; vg=None
    for i,s in enumerate(segs):
        if s[0]<=gate: out.append(s); vg=s[1]; continue
        p=segs[i-1]; fr=(gate-p[0])/(s[0]-p[0])
        vg=p[1]+(s[1]-p[1])*fr if s[2]=='lin' else p[1]*(s[1]/p[1])**fr
        out.append((gate,vg,s[2])); break
    if vg is None: vg=FLOOR
    tr=trfun(max(0,20*math.log10(max(vg,1e-12)/FLOOR)))
    if not math.isfinite(tr): tr=5
    tg=max(gate,out[-1][0]); out.append((tg+max(0.002,tr),FLOOR,'exp')); out.append((tg+max(0.002,tr)+0.001,0,'set'))
    return out
def ym_env(op,kc,peak,gate):
    Rar=ym_rate(op['ar'],kc,op['rs']); ta=0.0005 if Rar>=62 else (0.108*ym_t96(Rar) if Rar else math.inf)
    if not math.isfinite(ta) or peak<=FLOOR: return [(0,0,'set')]
    slDb=93 if op['d1l']==15 else 3*op['d1l']; sl=peak*10**(-slDb/20)
    segs=[(0,FLOOR,'set'),(ta,peak,'lin')]; t=ta
    t1=ym_t96(ym_rate(op['d1r'],kc,op['rs']))*slDb/96
    if math.isfinite(t1) and slDb>0:
        v=max(sl,FLOOR); segs.append((t+t1,v,'exp')); t+=t1
        t2=ym_t96(ym_rate(op['d2r'],kc,op['rs']))*(96-slDb)/96
        if math.isfinite(t2) and v>FLOOR*1.01: segs.append((t+t2,FLOOR,'exp'))
    return trunc_release(segs,gate,lambda db:ym_t96(ym_rate(op['rr']*2+1,kc,op['rs']))*db/96)
def opl_t(rate,kc,ksr,attack=False):
    if not rate: return math.inf
    off=kc if ksr else kc>>2; r=min(63,4*rate+off)
    if attack and r>=60: return 0.0003
    return (2.82624 if attack else 39.28064)*2**(-(r-4)/4)
def opl_env(op,kc,peak,gate):
    ta=opl_t(op['ar'],kc,op['ksr'],True)
    if not math.isfinite(ta): return [(0,0,'set')]
    slDb=93 if op['sl']==15 else 3*op['sl']; sl=max(FLOOR,peak*10**(-slDb/20)); P=[(0,FLOOR,'set'),(ta,peak,'lin')]; t=ta
    td=opl_t(op['dr'],kc,op['ksr'])*slDb/96
    if math.isfinite(td): P.append((t+td,sl,'exp')); t+=td
    if not op['eg'] and math.isfinite(td):
        tr0=opl_t(op['rr'],kc,op['ksr'])*(96-slDb)/96
        if math.isfinite(tr0): P.append((t+tr0,FLOOR,'exp'))
    return trunc_release(P,gate,lambda db:opl_t(op['rr'],kc,op['ksr'])*db/96)
def env_at(P,t):
    if not P: return 0
    v=P[0][1]
    for i in range(1,len(P)):
        s=P[i]; p=P[i-1]
        if t>=s[0]: v=s[1]; continue
        if s[2]=='set': return p[1]
        fr=(t-p[0])/max(1e-9,s[0]-p[0])
        return p[1]+(s[1]-p[1])*fr if s[2]=='lin' else max(1e-9,p[1])*(max(1e-9,s[1])/max(1e-9,p[1]))**fr
    return v
def env_render(P,frm,n):
    """sample the breakpoint list (starting from level frm, like applyEnv) for n samples"""
    tt=np.arange(n)/SR; out=np.zeros(n); prev_t=0.0; prev_v=max(frm,0) if frm>=FLOOR else P[0][1]
    pts=list(P[1:]) if P else []
    if not P: return out
    out[:]=prev_v; cur_t,cur_v=0.0,prev_v
    for (t1,v1,kind) in pts:
        i0=int(cur_t*SR); i1=min(n,int(t1*SR))
        if i1>i0:
            seg=tt[i0:i1]
            if kind=='set': out[i0:i1]=cur_v
            elif kind=='lin': out[i0:i1]=cur_v+(v1-cur_v)*(seg-cur_t)/max(1e-9,t1-cur_t)
            else:
                a=max(1e-6,cur_v); b=max(1e-6,v1); out[i0:i1]=a*(b/a)**((seg-cur_t)/max(1e-9,t1-cur_t))
        cur_t,cur_v=t1,v1
        if i1>=n: break
    i0=int(cur_t*SR)
    if i0<n: out[i0:]=cur_v
    return out
_fb={}
def opl_wave(ws,ph):
    s=np.sin(ph)
    if ws==1: return np.maximum(0,s)
    if ws==2: return np.abs(s)
    if ws==3: q=(ph/(2*np.pi))%1; return np.where((q%0.5)<0.25,np.abs(s),0)
    return s
def fb_table(fb,amp,ws=0):
    key=(fb,round(amp*50),ws)
    if key in _fb: return _fb[key]
    L=128; H=48; c=(math.pi/16*2**(fb-1)*amp) if fb else 0; x1=x2=0.0; buf=np.zeros(L)
    for n in range(L*40):
        ph=2*math.pi*(n%L)/L+c*(x1+x2)/2; x=float(opl_wave(ws,np.array(ph)))
        x2=x1; x1=x
        if n>=L*39: buf[n-L*39]=x
    F=np.fft.rfft(buf)/L*2; F[0]=0; F[H:]=0
    M=4096; tab=np.fft.irfft(F*M/2,M)    # band-limited table like the PeriodicWave
    tab=np.fft.irfft(np.concatenate([F[:H],np.zeros(M//2+1-H)])*M/2,M)
    _fb[key]=tab; return tab
def fb_dtable(fb,amp,ws=0):
    """derivative (d/dtheta) of the feedback wave: used on the FM modulation path so FM == the chip's PM"""
    key=('d',fb,round(amp*50),ws)
    if key in _fb: return _fb[key]
    t=fb_table(fb,amp,ws); M=len(t); F=np.fft.rfft(t); k=np.arange(len(F)); D=F*1j*k
    _fb[key]=np.fft.irfft(D,M); return _fb[key]
def fb_exact(fb,ph,env):
    c=math.pi/16*2**(fb-1); out=np.empty(len(ph)); x1=x2=0.0; e=env
    for i in range(len(ph)):
        x=math.sin(2*math.pi*ph[i]+c*(x1+x2)/2)*e[i]; out[i]=x/(e[i] if e[i]>1e-9 else 1); x2=x1; x1=x
    return out
def wave_lookup(tab,phase):
    M=len(tab); idx=(phase%1.0)*M; i=idx.astype(int)%M; fr=idx-np.floor(idx); return tab[i]*(1-fr)+tab[(i+1)%M]*fr
def cents_curve(pc,n,ts=1.0):
    c=np.zeros(n)
    for fr,v in (pc or []):
        i=int(fr/60*ts*SR)
        if i<n: c[i:]=v
    return c
MODE={'pm':False}
def render_fm4(V,notes,n_out,bright=1.0):
    """notes: list of (t, f, gate, va, pc) for ONE voice object (channel+voice id), in time order"""
    car=YM_CAR[V['alg']]; links=YM_ALG[V['alg']]; ops=V['op']
    env={j:np.zeros(n_out) for j in (1,2,3,4)}; fr={j:np.zeros(n_out) for j in (1,2,3,4)}; mgk={j:np.zeros(n_out) for j in (1,2,3,4)}
    cents=np.zeros(n_out); prev={j:None for j in (1,2,3,4)}; tprev=-1
    for k,(t,f,gate,va,pc) in enumerate(notes):
        i0=int(t*SR)
        if i0>=n_out: break
        i1=n_out
        kc=ym_keycode(f); n=i1-i0
        cents[i0:i1]=cents_curve(pc,n)
        for j in (1,2,3,4):
            op=ops[j-1]; mul=op['mul'] or 0.5; dtv=DT_TAB[op['dt']&3][kc]*(-1 if op['dt']&4 else 1)
            fr[j][i0:i1]=f*mul+dtv*0.0508*mul; mgk[j][i0:i1]=KPM*f*mul
            isc=j in car; tl=min(127,op['tl']+(max(0,va) if isc else 0)); peak=10**(-0.75*tl/20)*(1 if isc else bright)
            P=ym_env(op,kc,peak,gate); frm=env_at(prev[j],t-tprev) if prev[j] else 0
            env[j][i0:i1]=env_render(P,frm,n); prev[j]=P
        tprev=t
    det=2**(cents/1200); y={}; out=np.zeros(n_out)
    amp1=min(1,10**(-0.75*ops[0]['tl']/20))
    for j in (1,2,3,4):
        f_inst=fr[j].copy(); pmod=0
        for a,b in links:
            if b==j:
                if MODE['pm']: pmod=pmod+KPM*y[a]/(2*np.pi)
                else: f_inst=f_inst+mgk[a]*(y[a] if not (a==1 and V['fb']) else yd1)
        ph=np.cumsum(f_inst*det/SR)+pmod
        if j==1 and V['fb'] and MODE['pm']:
            w=fb_exact(V['fb'],ph,env[1]); 
        else: w=wave_lookup(fb_table(V['fb'],amp1),ph) if (j==1 and V['fb']) else np.sin(2*np.pi*ph)
        if j==1 and V['fb']: yd1=wave_lookup(fb_dtable(V['fb'],amp1),ph)*env[1]
        y[j]=w*env[j]
        if j in car: out+=y[j]
    return out
def render_opl2(V,notes,n_out,depth,bright=1.0):
    M=V['mod']; C=V['car']; envM=np.zeros(n_out); envC=np.zeros(n_out); fm=np.zeros(n_out); fc=np.zeros(n_out)
    pm=pc_=None; tprev=-1
    def ksl_db(op,f): return 0 if not op['ksl'] else max(0,math.log2(f/130.8))*[0,3,1.5,6][op['ksl']]
    for t,f,gate,va,pc in notes:
        i0=int(t*SR)
        if i0>=n_out: break
        n=n_out-i0; kc=max(0,min(15,int(math.floor(math.log2(f/32.7)))*2+1))
        fm[i0:]=f*(M['mul'] or 0.5); fc[i0:]=f*(C['mul'] or 0.5)
        pkM=10**(-(0.75*M['tl']+ksl_db(M,f))/20)*(1 if V['con'] else bright)
        pkC=10**(-(0.75*min(63,C['tl']+max(0,va or 0))+ksl_db(C,f))/20)
        PM=opl_env(M,kc,pkM,gate); PC=opl_env(C,kc,pkC,gate)
        envM[i0:]=env_render(PM,env_at(pm,t-tprev) if pm else 0,n); envC[i0:]=env_render(PC,env_at(pc_,t-tprev) if pc_ else 0,n)
        pm,pc_=PM,PC; tprev=t
    tt=np.arange(n_out)/SR
    vibc=depth['vib']*np.sin(2*np.pi*6.1*tt); vm=2**((vibc if M['vib'] else 0)/1200); vcar=2**((vibc if C['vib'] else 0)/1200)
    ampM=min(1,10**(-0.75*M['tl']/20))
    ym=wave_lookup(fb_table(V.get('fb',0),ampM,M['ws']),np.cumsum(fm*vm/SR))*envM
    if V['con']: fcar=fc
    else: fcar=fc+OPL_KPM*fm*ym
    yc=wave_lookup(fb_table(0,0,C['ws']),np.cumsum(fcar*vcar/SR))*envC
    if C['am'] or M['am']:
        d=(1-10**(-depth['am']/20))/2; trem=1-d+d*np.sin(2*np.pi*3.7*tt); yc=yc*trem
    return yc+(ym if V['con'] else 0)
_nz={}
def psg_noise(white):
    if white in _nz: return _nz[white]
    n=65536; d=np.empty(n); reg=0x8000
    for i in range(n):
        fb=((reg&1)^((reg>>3)&1)) if white else (reg&1); reg=(reg>>1)|(fb<<15); d[i]=1 if reg&1 else -1
    _nz[white]=d; return d
def render_psg(cells,n_out,noise=False):
    """cells: list of (t, cell, f, gate, lvl) in time order"""
    out=np.zeros(n_out); ph=0.0
    for k,(t,cell,f,gate,lvl) in enumerate(cells):
        i0=int(t*SR); i1=min(n_out,int((t+gate)*SR))
        if i0>=n_out or i1<=i0: continue
        n=i1-i0; g=np.zeros(n)
        for fr,att in cell.get('vc',[[0,0]]):
            j=int(fr/60*SR)
            if j>=n: break
            g[j:]=0 if att>=15 else lvl*10**(-2*att/20)
        if noise:
            mode=cell.get('nz',0xE7); white=bool(mode&4)
            N=max(1,round(3579545/32/max(1,f))) if (mode&3)==3 else [16,32,64][mode&3]
            rate=3579545/(32*N); src=psg_noise(white); idx=(np.arange(n)*rate/SR).astype(int)%len(src); w=src[idx]
        else:
            fr_=f*2**(cents_curve(cell.get('pc'),n)/1200); phs=ph+np.cumsum(fr_/SR); ph=phs[-1]%1
            w=np.where((phs%1)<0.5,1.0,-1.0)
        out[i0:i1]+=w*g
    return out
