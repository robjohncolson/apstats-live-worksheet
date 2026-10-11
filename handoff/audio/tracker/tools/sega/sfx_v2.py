#!/usr/bin/env python3
"""Accurate SFX data ('v2'): every original sound effect run through the SAME SMPS driver emulation as the songs
(tools/sega/smps_drv.py): note-fill, ties, detune, F0 modulation and S3K modulation envelopes, per-note volume, pan,
and the real ROM PSG volume envelopes (F5). Adds fx.v2 = {frames, voices (4-op), tracks:[{ch, kind, notes}]} to
sfx/genesis-s1.json / genesis-s3k.json; tracker-engine.js plays v2 through the 4-op ChipDSP worklet (normal power) and
keeps the older 2-op 'channels' data as the lowPower path.  usage: python3 tools/sega/sfx_v2.py"""
import os,sys,json,struct,math
HERE=os.path.dirname(os.path.abspath(__file__)); TR=os.path.dirname(os.path.dirname(HERE)); SON='/workspace/sonic'
sys.path[:0]=[HERE,os.path.join(TR,'tools'),SON]
import smps_drv as D, kos
NAMES={0x80:'PSG1',0xA0:'PSG2',0xC0:'PSG3',0xE0:'PSG3',0:'FM1',1:'FM2',2:'FM3',4:'FM4',5:'FM5',6:'FM6'}
class SfxDriver(D.Driver):
    def __init__(s,rom,var,hdr,bank,tabvar):
        s.r=rom; s.v=var; s.start=hdr; s.bank=bank; s.tab=D.tables(tabvar,rom); s.unk=set()
        be='>' if var=='s1' else '<'
        vp,mult,n=struct.unpack_from(be+'HBB',rom,hdr); s.vp=vp; s.div=mult; s.tempo=0; s.tracks=[]
        for i in range(n):
            fl,cid,ptr,tr,vol=struct.unpack_from(be+'BBHbb',rom,hdr+4+6*i)
            nm=NAMES.get(cid,'FM%d'%(cid+1)); kind='psg' if cid>=0x80 else 'fm'
            t=D.T(nm,kind,s.addr(ptr),tr,vol,0,div=mult)
            if cid==0xE0: t.noise=0xE7
            s.tracks.append(t)
        s.frame=0; s.tf=0; s.acc=0; s.tout=0; s.writes=[]; s.psg=[]; s.dac=[]; s.notes={t.name:[] for t in s.tracks}; s.tfs=[]; s.noisemode=0xE7
def convert(d,L):
    out=[]; voices={}
    for t in d.tracks:
        notes=[]; kind=t.kind
        for n in d.notes[t.name]:
            val=n['base']+n['det']; hz0=D.fm_hz(val) if kind=='fm' else D.psg_hz(val)
            x={'f':n['f0'],'l':max(1,n['f1']-n['f0']),'n':round(69+12*math.log2(hz0/440),2)}
            pc=[]; last=0
            for fr,v in n['curve']:
                if fr==0: continue
                hz=D.fm_hz(v) if kind=='fm' else D.psg_hz(v); c=round(1200*math.log2(hz/hz0),1)
                if c!=last: pc.append([fr,c]); last=c
            if pc: x['pc']=pc
            if kind=='fm':
                vid=n['voice'] or 0; x['vo']=vid; x['va']=n['vol']
                if n['pan']&0xC0!=0xC0: x['pb']=n['pan']
                if str(vid) not in voices:
                    v=D.decode_voice(d.r[d.voice_addr(vid):d.voice_addr(vid)+25]); voices[str(vid)]={'alg':v['alg'],'fb':v['fb'],'op':[v['op'][k] for k in (1,2,3,4)]}
            else:
                x['vc']=[list(y) for y in n['vcurve']] or [[0,max(0,min(15,n['vol']))]]
                if n['noise'] is not None: x['nz']=n['noise']
            notes.append(x)
        if notes: out.append({'ch':t.name,'kind':'noise' if any('nz' in x for x in notes) else kind,'notes':notes})
    return {'frames':L,'voices':voices,'tracks':out}
def run(var,rom,ptrs,ids,bank,tabvar,data):
    for sid,hdr in zip(ids,ptrs):
        key='%02X'%sid
        if key not in data: continue
        d=SfxDriver(rom,var,hdr,bank,tabvar); L=0
        for f in range(720):
            d.step_frame()
            if all(t.done for t in d.tracks): L=f+1; break
        else: L=720
        for t in d.tracks: d.close(t)
        data[key]['v2']=convert(d,L)
if __name__=='__main__':
    p=os.path.join(TR,'sfx','genesis-s1.json'); J=json.load(open(p))
    r=open(os.path.join(SON,'sonic1rev1.bin'),'rb').read(); ptrs=struct.unpack_from('>48I',r,0x78B44)
    run('s1',r,ptrs,range(0xA0,0xD0),None,'s1',J['sfx']); json.dump(J,open(p,'w'),separators=(',',':'))
    p3=os.path.join(TR,'sfx','genesis-s3k.json'); J3=json.load(open(p3))
    r3=open(os.path.join(SON,'knuckles.bin'),'rb').read(); blob=kos.kos(r3,0xF7760)
    ws=struct.unpack_from('<173H',blob,0x37C+2); ptrs3=[0x1F*0x8000+w-0x8000 for w in ws]
    run('s3k',r3,ptrs3,range(0x33,0x33+173),0x1F,'sk',J3['sfx']); json.dump(J3,open(p3,'w'),separators=(',',':'))
    for nm,JJ in (('s1',J),('s3k',J3)):
        v=[x['v2'] for x in JJ['sfx'].values() if 'v2' in x]
        print(nm,len(v),'effects; psg notes with envelope curves',sum(1 for x in v for t in x['tracks'] if t['kind']!='fm' for n in t['notes'] if len(n['vc'])>1),
              'mod/slide notes',sum(1 for x in v for t in x['tracks'] for n in t['notes'] if 'pc' in n), 'bytes',os.path.getsize(os.path.join(TR,'sfx','genesis-%s.json'%nm)))
