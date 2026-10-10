import json,sys,os
sys.path.insert(0,os.path.dirname(__file__)); from arrange import arrange,load_score,instruments_for
here=os.path.dirname(os.path.abspath(__file__))
cfg=json.load(open(os.path.join(here,'songs.config.json')))
only=sys.argv[1:]
for name,c in cfg.items():
    if only and name not in only: continue
    out=os.path.join(here,'..','songs',name+'.json')
    if c.get('frozen'):
        song=json.load(open(out)); plat,ins=instruments_for(c['opts'])
        song.update(id=c['opts']['id'],instrumentSet=plat,instruments=ins,palette=c['opts']['palette'])
        json.dump(song,open(out,'w'),separators=(',',':')); print(name,'frozen cells, re-voiced as',plat); continue
    song,info=arrange(load_score(c['src']),c['opts'])
    json.dump(song,open(out,'w'),separators=(',',':')); print(name,song['instrumentSet'],json.dumps(info))
