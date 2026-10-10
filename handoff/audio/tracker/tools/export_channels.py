import sys,json
from smps import Song
import convert as C
def export(rom,var,start,bank,chans,out):
    s=Song(open(rom,'rb').read(),var,start,bank); C.RATE[0]=C.rate(var,s.tempo); ev,S,P=C.analyze(s)
    k=60*C.RATE[0]; res={}
    for ch in chans:
        n=sorted((a,b-a,p) for name,kd,a,b,p in ev if name==ch and S<=a<S+P and p not in (None,'noise'))
        m=[]
        for a,d,p in n:   # same swell-merge/fragment rule as the score build
            if m and m[-1][2]==p and a-(m[-1][0]+m[-1][1])<=1 and (d<=2 or m[-1][1]<=2): m[-1]=(m[-1][0],a+d-m[-1][0],p); continue
            m.append((a,d,p))
        res[ch]=[[round((a-S)/k,4),round(min(d,S+P-a)/k,4),p] for a,d,p in m if d>=2]
    json.dump({'loopSeconds':round(P/k,6),'channels':res},open(out,'w'))
    print(out,{c:len(v) for c,v in res.items()})
export('sonic3.bin','s3k',0xD06AA,0x1A,['PSG1','FM2'],'out/icecap-channels.json')
