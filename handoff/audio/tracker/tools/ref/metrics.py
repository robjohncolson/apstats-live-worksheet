"""Similarity metrics between a render and the reference (both mono, 44.1 kHz, same segment).
spectral : mean per-frame cosine similarity of log-magnitude 1/6-octave band spectra (46 ms frames), 0..1
chroma   : mean per-frame cosine similarity of 12-bin chroma (pitch content), 0..1
onset    : Pearson correlation of spectral-flux onset envelopes below 5 kHz (best lag within +-23 ms), -1..1
           (above 5 kHz the emulator's resampling images dominate the flux; a Genesis' own output filter removes them)
level    : RMS of the per-band level difference in dB (lower is better; balance/brightness)"""
import numpy as np
SR=44100; N=2048; H=1024
def stft(x):
    x=np.asarray(x,float)
    if x.ndim>1: x=x.mean(axis=1)
    n=1+(len(x)-N)//H; w=np.hanning(N)
    fr=np.lib.stride_tricks.as_strided(x,(n,N),(x.strides[0]*H,x.strides[0]))
    return np.abs(np.fft.rfft(fr*w,axis=1))
def bands(S):
    f=np.fft.rfftfreq(N,1/SR); edges=40*2**(np.arange(0,int(np.log2(16000/40)*6)+1)/6)
    B=np.stack([S[:,(f>=a)&(f<b)].sum(axis=1) for a,b in zip(edges[:-1],edges[1:])],1)
    return B
def chroma(S):
    f=np.fft.rfftfreq(N,1/SR); m=(f>50)&(f<5000); pc=(np.round(12*np.log2(f[m]/440))+69)%12
    C=np.zeros((S.shape[0],12))
    for k in range(12): C[:,k]=(S[:,m][:,pc==k]**2).sum(axis=1)
    return C
def cos(a,b):
    na=np.linalg.norm(a,axis=1); nb=np.linalg.norm(b,axis=1); ok=(na>1e-9)&(nb>1e-9)
    return float(np.mean((a[ok]*b[ok]).sum(1)/(na[ok]*nb[ok]))) if ok.any() else 0.0
def compare(x,ref):
    n=min(len(x),len(ref)); A=stft(x[:n]); B=stft(ref[:n])
    BA,BB=bands(A),bands(B)
    LA=np.log10(BA+1e-6*BA.max()); LB=np.log10(BB+1e-6*BB.max())
    LA-=LA.mean(); LB-=LB.mean()
    spec=cos(LA-LA.mean(1,keepdims=True)+0,LB-LB.mean(1,keepdims=True)+0)
    # band balance over the whole segment (dB, level-normalised)
    ma=10*np.log10(BA.mean(0)**2+1e-12); mb=10*np.log10(BB.mean(0)**2+1e-12); ma-=ma.max(); mb-=mb.max()
    keep=mb>-50; level=float(np.sqrt(np.mean((ma[keep]-mb[keep])**2)))
    ch=cos(chroma(A),chroma(B))
    fq=np.fft.rfftfreq(N,1/SR)<5000
    def flux(S):
        S=S[:,fq]; L=np.log1p(S/ (S.mean()+1e-9)); d=np.maximum(0,np.diff(L,axis=0)).sum(1); return (d-d.mean())/(d.std()+1e-9)
    fa,fb=flux(A),flux(B); best=-1
    for lag in range(-1,2):
        a=fa[max(0,lag):len(fa)+min(0,lag)]; b=fb[max(0,-lag):len(fb)+min(0,-lag)]; m=min(len(a),len(b))
        best=max(best,float(np.corrcoef(a[:m],b[:m])[0,1]))
    return {'spectral':round(spec,3),'chroma':round(ch,3),'onset':round(best,3),'levelDb':round(level,2)}
