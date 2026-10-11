#!/usr/bin/env python3
"""Extract original DAC drum samples (DPCM) -> samples/<kit>/<sample>.wav + samples/<kit>.json (base64 8-bit PCM for the engine).
S1 REV01: Kosinski DAC driver @0x72E7C, sample table @z80 0xD6 (ptr,len,pitch,pad x3): kick, snare, timpani.
S3: per-bank DAC playlists at the start of banks 0x1C/0x1D/0x1E (pointer table -> 5-byte entries: rate, len, ptr).
S&K: bank 0x1E playlist (IDs whose data decode cleanly in that bank).
DPCM: 16-entry delta table, accumulator starts at 0x80, high nibble first.
Rates (SMPSPlay-style cycle model): S1 fs = 2*3579545/(288+26*pitch); S3K fs = 2*3579545/(297+26*rate)."""
import struct,os,sys,json,base64,wave,numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); TR=os.path.dirname(os.path.dirname(HERE)); SON='/workspace/sonic'
sys.path.insert(0,SON); import kos
DT=[0,1,2,4,8,0x10,0x20,0x40,0x80,0xFF,0xFE,0xFC,0xF8,0xF0,0xE0,0xC0]
def dpcm(b):
    a=0x80; out=bytearray(); wr=0
    for x in b:
        for nib in (x>>4,x&15):
            n=(a+DT[nib])&0xFF; wr+=abs(n-a)>128; a=n; out.append(a)
    return bytes(out),wr
S1RATE=lambda p:2*3579545/(288+26*p); S3RATE=lambda r:2*3579545/(297+26*r)
def kit_s1():
    d=kos.kos(open(os.path.join(SON,'sonic1rev1.bin'),'rb').read(),0x72E7C); S={}
    for i,nm in enumerate(('kick','snare','timpani')):
        p,l,pit=struct.unpack_from('<HHB',d,0xD6+8*i); S[nm]=(dpcm(d[p:p+l])[0],S1RATE(pit))
    ids={'81':('kick',0x17),'82':('snare',0x01),'83':('timpani',0x1B),'88':('timpani',0x12),'89':('timpani',0x15),'8A':('timpani',0x1C),'8B':('timpani',0x1D)}
    return S,{k:{'sample':s,'rate':round(S1RATE(p),1)} for k,(s,p) in ids.items()}
def playlist(d,base):
    for k in range(68):
        e=struct.unpack_from('<H',d,base+2*k)[0]; yield 0x81+k,struct.unpack_from('<BHH',d,base+e-0x8000)
def kit_s3k(fn,banks):
    d=open(os.path.join(SON,fn),'rb').read(); S={}; ids={}
    for b in banks:
        for i,(rate,l,p) in playlist(d,b*0x8000):
            if l<4 or p+l>0x10000: continue
            pcm,wr=dpcm(d[b*0x8000+p-0x8000:b*0x8000+p-0x8000+l])
            if wr/len(pcm)>0.004 or '%02X'%i in ids: continue
            name='s%02x_%04x'%(b,p); S.setdefault(name,(pcm,S3RATE(rate)))
            ids['%02X'%i]={'sample':name,'rate':round(S3RATE(rate),1)}
    return S,ids
def write(kit,S,ids,src):
    od=os.path.join(TR,'samples',kit); os.makedirs(od,exist_ok=True); tot=0
    for nm,(pcm,fs) in S.items():
        with wave.open(os.path.join(od,nm+'.wav'),'wb') as w: w.setnchannels(1); w.setsampwidth(1); w.setframerate(int(round(fs))); w.writeframes(pcm)
        tot+=os.path.getsize(os.path.join(od,nm+'.wav'))
    J={'kit':kit,'source':src,'format':'8-bit unsigned PCM, base64','samples':{nm:{'rate':round(fs,1),'n':len(pcm),'pcm':base64.b64encode(pcm).decode()} for nm,(pcm,fs) in S.items()},'ids':ids}
    json.dump(J,open(os.path.join(TR,'samples',kit+'.json'),'w'),separators=(',',':'))
    print(kit,len(ids),'DAC ids,',len(S),'unique samples,',tot,'bytes WAV,',os.path.getsize(os.path.join(TR,'samples',kit+'.json')),'bytes JSON')
if __name__=='__main__':
    write('s1',*kit_s1(),'Sonic 1 REV01 DAC driver (DPCM)')
    write('s3',*kit_s3k('sonic3.bin',(0x1C,0x1D,0x1E)),'Sonic 3 DAC banks 1C-1E (DPCM)')
    write('sk',*kit_s3k('knuckles.bin',(0x1E,)),'Sonic & Knuckles DAC bank 1E (DPCM)')
