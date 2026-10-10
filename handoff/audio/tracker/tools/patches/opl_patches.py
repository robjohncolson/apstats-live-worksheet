"""Per-channel OPL2 instrument registers from the IMF stream of 'Wednesday On the Beach' (chunk 197), mapped to 2-op."""
import pickle,struct,json
from collections import Counter
ch=pickle.load(open('chunks.pkl','rb')); c=ch[197]; n=struct.unpack_from('<H',c,0)[0]
cm=[struct.unpack_from('<BBH',c,2+i) for i in range(0,n,4)]
SLOT=[0,1,2,8,9,10,16,17,18]; regs={}; seen={k:Counter() for k in range(9)}; bh=[0]*9
for r,v,d in cm:
    regs[r]=v
    if 0xB0<=r<=0xB8:
        k=r-0xB0
        if v&0x20 and not bh[k]&0x20:
            m,cr=SLOT[k],SLOT[k]+3
            seen[k][tuple(regs.get(b+o,0) for b in (0x20,0x40,0x60,0x80,0xE0) for o in (m,cr))+(regs.get(0xC0+k,0),)]+=1
        bh[k]=v
MULT=[0.5,1,2,3,4,5,6,7,8,9,10,10,12,12,15,15]; WAVES=['sine','halfsine','abssine','quartersine']
def rt(r,scale): return 10.0 if r==0 else max(0.003,scale*2**(-r/1.0))
def two_op(p):
    am,ac,tm,tc,adm,adc,srm,src,wm,wc,fbc=p
    M=dict(mul=MULT[am&15],tl=tm&63,ar=adm>>4,dr=adm&15,sl=srm>>4,rr=srm&15,eg=bool(am&0x20),wave=WAVES[wm&3])
    C=dict(mul=MULT[ac&15],tl=tc&63,ar=adc>>4,dr=adc&15,sl=src>>4,rr=src&15,eg=bool(ac&0x20),wave=WAVES[wc&3])
    add=bool(fbc&1); amp=10**(-0.75*M['tl']/20)
    fm=dict(ratio=round(M['mul']/C['mul'],3),index=0 if add else round(min(6,4*amp),3),addLevel=round(amp,3) if add else 0,
            fb=(fbc>>1)&7,modWave=M['wave'],carWave=C['wave'],
            modAttack=round(rt(M['ar'],3) if M['ar']<15 else 0.001,4),modDecay=round(rt(M['dr'],12),4),modSus=round(10**(-3*M['sl']/20),3) if not M['eg'] or True else 1,
            adsr=[round(rt(C['ar'],3) if C['ar']<15 else 0.002,4),round(min(2,rt(C['dr'],12)),4),round(10**(-3*C['sl']/20) if C['eg'] else 0.5,3),round(max(0.02,min(1.5,rt(C['rr'],12))),4)])
    return {'mod':M,'car':C,'connection':'additive' if add else 'fm','fm':fm}
use={k:v for k,v in seen.items() if v}
print('channels with key-ons:',{k:sum(v.values()) for k,v in use.items()})
rest=sorted((k for k in use if k not in (8,1)),key=lambda k:-sum(use[k].values()))
ROLE={'lead':8,'bass':1,'arp':rest[0],'pad':rest[1] if len(rest)>1 else rest[0]}
out={}
for stem,k in ROLE.items():
    p=use[k].most_common(1)[0][0]; out[stem]={'oplChannel':k,'regs':['%02X'%x for x in p],'patches':len(use[k]),**two_op(p)}
    print(stem,'ch',k,out[stem]['connection'],'mod',out[stem]['mod']['wave'],'car',out[stem]['car']['wave'],out[stem]['fm'])
json.dump(out,open('opl-patches.json','w'),indent=1)
