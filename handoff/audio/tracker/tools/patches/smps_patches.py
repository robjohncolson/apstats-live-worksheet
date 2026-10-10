"""Extract each channel's SMPS FM voice (25-byte YM2612 patch) and map it to a 2-op approximation."""
import json,struct,sys
sys.argv=['x']; import run_all  # noqa: builds JOBS (prints conversion log)
OPS=[1,3,2,4]                      # SMPS byte order for operator fields
CARRIERS={0:[4],1:[4],2:[4],3:[4],4:[2,4],5:[2,3,4],6:[2,3,4],7:[1,2,3,4]}
def decode(r,a):
    fbalg=r[a]; f=lambda base:{OPS[i]:r[a+base+i] for i in range(4)}
    dm,ra,dr,d2,rr,tl=f(1),f(5),f(9),f(13),f(17),f(21)
    return {'alg':fbalg&7,'fb':(fbalg>>3)&7,'op':{o:{'mul':dm[o]&15,'ar':ra[o]&31,'d1r':dr[o]&31,'d2r':d2[o]&31,'d1l':rr[o]>>4,'rr':rr[o]&15,'tl':tl[o]&127} for o in (1,2,3,4)}}
def rate_t(r,scale=8.0): return 10.0 if r==0 else max(0.004,scale*2**(-r/3.0))
def two_op(p):
    alg=p['alg']; car=p['op'][4]; mods=[o for o in (1,2,3) if o not in CARRIERS[alg]]
    m=min(mods,key=lambda o:p['op'][o]['tl']) if mods else None
    mul=lambda x:0.5 if x==0 else x
    out={'alg':alg,'fb':p['fb'],'carMul':mul(car['mul'])}
    if m is None: out.update(ratio=1,index=0,modDecay=0.2,modSus=1)
    else:
        M=p['op'][m]; amp=10**(-0.75*M['tl']/20)
        out.update(modOp=m,ratio=round(mul(M['mul'])/mul(car['mul']),3),index=round(min(8,7*amp),3),
                   modAttack=round(rate_t(M['ar'],0.6) if M['ar']<31 else 0.001,4),modDecay=round(rate_t(M['d1r']),4),modSus=round(10**(-3*M['d1l']/20),3))
    if len(CARRIERS[alg])>1: out['index']=round(out['index']*0.6,3)   # parallel carriers: brightness spread
    out['adsr']=[round(rate_t(car['ar'],0.6) if car['ar']<31 else 0.002,4),round(min(2,rate_t(car['d1r'])),4),
                 round(10**(-3*car['d1l']/20) if car['d1r'] else 1,3),round(min(1.5,rate_t(car['rr']*2+1,4)),4)]
    out['modWave']='triangle' if p['fb']>=5 and out.get('modOp')==1 else 'sine'
    return out
ROLE={'sonic1-starlight':{'lead':'FM5','bass':'FM2','arp':'FM3','pad':'FM4'},
      'sonic3-icecap':{'lead':'PSG1','bass':'FM1','arp':'FM4','pad':'FM2'},
      'sonic3-launchbase':{'lead':'FM1','bass':'FM2','arp':'FM3','pad':'FM4'},
      'sk-mushroomhill':{'lead':'FM1','bass':'FM2','arp':'FM3','pad':'FM4'}}
res={}
for name,var,s,src in run_all.JOBS:
    s.run(4000); r=s.r; res[name]={}
    for stem,ch in ROLE[name].items():
        t=next(x for x in s.tracks if x.name==ch)
        vc={k:v for k,v in getattr(t,'vc',{}).items() if not (var=='s3k' and k&0x80)}
        if ch.startswith('PSG') or not vc: res[name][stem]={'channel':ch,'psg':True}; continue
        vid=max(vc,key=vc.get); p=decode(r,s.voice_addr(vid))
        res[name][stem]={'channel':ch,'voice':vid,'raw':p,'fm':two_op(p)}
json.dump(res,open('out/fm-patches.json','w'),indent=1)
for n,v in res.items():
    print(n); [print('  ',k,x['channel'],'PSG square' if x.get('psg') else 'v%02X alg%d fb%d ratio %s idx %s modDec %s adsr %s'%(x['voice'],x['fm']['alg'],x['fm']['fb'],x['fm']['ratio'],x['fm']['index'],x['fm']['modDecay'],x['fm']['adsr'])) for k,x in v.items()]
