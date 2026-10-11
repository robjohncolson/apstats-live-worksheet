import json,os
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.dirname(here)
t=open(os.path.join(root,'demo.template.html')).read()
for k,f in (('ENGINE','tracker-engine.js'),('VIBE','vibe.js'),('PALETTE','palette.js')):
    t=t.replace('/*%s*/'%k,open(os.path.join(root,f)).read().replace('</script','<\\/script'))
order=['park-bounce','launchbase','icecap','mushroomhill','keen-wotb']
songs={i:json.load(open(os.path.join(root,'songs',i+'.json'))) for i in order}
seg=[]
for k in ('s3','sk'):
    f=os.path.join(root,'samples',k+'.json')
    if os.path.exists(f): seg.append('TrackerEngine.registerKit(%s);'%open(f).read())
for k in ('genesis-s3k',):
    f=os.path.join(root,'sfx',k+'.json')
    if os.path.exists(f): seg.append('TrackerEngine.registerSfx(%s);'%open(f).read())
t=t.replace('/*SEGADATA*/','\n'.join(seg))
t=t.replace('/*SONGS*/',json.dumps(songs,separators=(',',':')))
open(os.path.join(root,'demo.html'),'w').write(t); print('demo.html',len(t))
