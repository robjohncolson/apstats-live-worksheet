// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

describe('E lag-targeted pairing',()=>{
  it('matches the corrected Work Day B date fixture in both JSON copies',()=>{
    for(const path of ['data/lesson-schedule.json','roster-server/data/lesson-schedule.json']){
      const column=readFileSync(path,'utf8').split(/\r?\n/).filter(line=>/^\s*"B":/.test(line)&&!/^\s*"B": \[\]/.test(line)).join('\n');
      expect(createHash('sha256').update(column).digest('hex')).toBe('b88d5ceaf557d4b6323171fb69f5a37ca734b59029ae1390e3c0039bdde5ea8b');
    }
  });
});

import {createContext,runInContext} from 'node:vm';
import {parse} from 'acorn';
import {JSDOM} from 'jsdom';
const html=readFileSync('ap_stats_roadmap_square_mode.html','utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(match=>match[1].includes('function showResourcePanel'))[1];
const ast=parse(source,{ecmaVersion:'latest'});
function fn(name){const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);if(!n)throw Error(name);return source.slice(n.start,n.end);}
function constant(name){return ast.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name===name).init;}
function load(names,globals={}){
  const s=createContext({R:'review',OFF:'off',EX:'exam',PO:'post',NC:'noclass',cYear:'SY26-27',...globals});
  const realWindow=s.window;s.window=s;
  for(const path of ['js/ced2026-crosswalk.js','js/ced2026-labels.js'])runInContext(readFileSync(path,'utf8'),s);
  if(realWindow)s.window=realWindow;
  runInContext([...new Set(['d','groupTopics','groupLabel',...names])].map(fn).join('\n'),s);
  return s;
}
function generated(){
  const s=load(['dateFromArr','buildOffSet','enumWeekdays','injectPcPosterEvents','generateSchedule']);
  for(const name of ['SY2627_PACING_B','SY2627_PACING_E','VIDEO_MINUTES']){const n=constant(name);runInContext('var '+name+'='+source.slice(n.start,n.end),s);}
  const n=constant('SCHEDULE_DEFS').properties.find(p=>p.key.value==='SY26-27').value;
  runInContext('var def='+source.slice(n.start,n.end)+';var S=generateSchedule(def);',s);
  return s;
}
const actual=generated();
const S=actual.S;
const first=S.find(row=>row[4]?.group)[4];
const pairs=[
  [
    "2026-09-16",
    "1.4+1.5",
    27
  ],
  [
    "2026-09-23",
    "1.7+1.8",
    27
  ],
  [
    "2026-09-25",
    "1.9+3.1",
    14
  ],
  [
    "2026-10-19",
    "2.1+2.2",
    16
  ],
  [
    "2026-10-23",
    "4.1+4.2",
    21
  ],
  [
    "2026-11-06",
    "4.7+4.8",
    20
  ],
  [
    "2026-11-20",
    "5.1+5.3",
    20
  ],
  [
    "2026-12-02",
    "5.4+5.5",
    18
  ],
  [
    "2027-01-11",
    "8.1+8.4",
    16
  ],
  [
    "2027-01-27",
    "5.7+7.1",
    23
  ],
  [
    "2027-03-05",
    "2.4+2.5",
    23
  ],
  [
    "2027-03-08",
    "2.6+2.7",
    29
  ]
];
const iso=row=>row[0]+'-'+String(row[1]+1).padStart(2,'0')+'-'+String(row[2]).padStart(2,'0');
describe('real extracted pairing generator',()=>{
 it('reproduces the entire acceptance table',()=>expect(S.filter(r=>r[4]?.group).map(r=>[iso(r),r[4].t,Math.round(r[4].group.reduce((sum,m)=>sum+actual.VIDEO_MINUTES[m.t],0))])).toEqual(pairs));
 it('keeps the single-block B rule when Work Days are disabled',()=>{
   const def={...actual.def,periods:{...actual.def.periods,B:{...actual.def.periods.B,workDayFrom:null}}};
   const paired=actual.generateSchedule(def);
   const single=actual.generateSchedule({...def,periods:{...def.periods,E:{...def.periods.E,doubleFrom:null}}});
   expect(JSON.stringify(paired.map(r=>r.slice(0,4)))).toBe(JSON.stringify(single.map(r=>r.slice(0,4))));
 });
 it('preserves the full shape, order and member keys',()=>{
   for(const row of S.filter(r=>r[4]?.group)){
     const c=row[4];expect(c.db).toBe(true);expect(c.t).toBe(c.group.map(m=>m.t).join('+'));
     expect(c.n).toBe(c.group.map(m=>m.n).join(' + '));
     for(const m of c.group)expect(Object.keys(m)).toEqual(expect.arrayContaining(['t','n','u','due','as','db','ced']));
   }
 });
 it('never pairs B, before Sep 16, events, across units, or above the applicable cap',()=>{
   for(const row of S){expect(row[3]?.group).toBeUndefined();if(!row[4]?.group)continue;
     expect(iso(row)>='2026-09-16').toBe(true);
     const early=actual.def.earlyRelease.some(d=>d.join('-')===row.slice(0,3).join('-'));
     expect(row[4].group.reduce((sum,m)=>sum+actual.VIDEO_MINUTES[m.t],0)).toBeLessThanOrEqual(early?20:30);
     expect(row[4].group.every(m=>!m.kind&&m.u>0&&m.u===row[4].u)).toBe(true);
   }
 });
 it.each(['orientation','poster','pc','baseline','review'])('does not pair an event of kind %s',kind=>{
   const def={...actual.def,range:{start:[2026,8,14],end:[2026,8,16]},periods:{...actual.def.periods,E:{...actual.def.periods.E,meetsDays:[3]}},pacing:{B:[{t:'b1',u:1},{t:'b2',u:1}],E:[{t:'1.4',n:'a',u:1},{t:'event',n:'event',u:1,kind}]}};
   expect(actual.generateSchedule(def).at(-1)[4].group).toBeUndefined();
 });
 it('does not pair across a unit boundary or with an untyped review',()=>{
   for(const next of [{t:'2.1',u:2},{t:'review',u:0}]){
     const def={...actual.def,range:{start:[2026,8,14],end:[2026,8,16]},periods:{...actual.def.periods,E:{...actual.def.periods.E,meetsDays:[3]}},pacing:{B:[{t:'b1',u:1},{t:'b2',u:1}],E:[{t:'1.4',n:'a',u:1},next]}};
     expect(actual.generateSchedule(def).at(-1)[4].group).toBeUndefined();
   }
 });
 it('reproduces five PC Day 2 dates and the review end',()=>{
   expect(S.filter(r=>r[4]?.kind==='pc'&&r[4].admin===2).map(iso)).toEqual(['2026-10-16','2026-11-30','2027-01-25','2027-03-03','2027-03-17']);
   expect(S.filter(r=>r[4]?.t==='review').map(iso).at(-1)).toBe('2027-03-24');
 });
});
describe('pairing guard regressions',()=>{
 function wednesday(topics=['1.4','1.5'], overrides={}){
   const def={...actual.def,range:{start:[2026,8,14],end:[2026,8,16]},
     periods:{B:{meetsDays:[1,2,3]},E:{...actual.def.periods.E,meetsDays:[3]}},
     pacing:{B:Array.from({length:3},()=>({t:'b',u:1})),E:topics.map(t=>({t,n:t,u:1}))},...overrides};
   return actual.generateSchedule(def).at(-1)[4];
 }
 it('pairs only with a real lead, counting B first on the same date',()=>{
   expect(wednesday().group).toHaveLength(2);
   expect(wednesday(undefined,{pacing:{B:[{t:'b',u:1}],E:[{t:'1.4',u:1},{t:'1.5',u:1}]}}).group).toBeUndefined();
   expect(wednesday(undefined,{pacing:{B:[{t:'b',u:1},{t:'b',u:1}],E:[{t:'1.4',u:1},{t:'1.5',u:1}]}}).group).toHaveLength(2);
 });
 it('fails closed for missing minutes and rejects the 47-minute pair',()=>{
   expect(wednesday(['6.2','6.3']).group).toBeUndefined();
   expect(wednesday(['1.4','missing']).group).toBeUndefined();
 });
 it('uses 20 minutes on early release and 30 otherwise',()=>{
   const earlyRelease=[[2026,8,16]];
   expect(wednesday(undefined,{earlyRelease}).group).toBeUndefined();
   expect(wednesday(['2.3','4.1'],{earlyRelease}).group).toHaveLength(2);
 });
 it('never permits a third pair in a Monday-Friday week even with a large backlog',()=>{
   const pacing={B:Array.from({length:80},()=>({t:'1.1',u:1})),
     E:[...Array.from({length:6},()=>({t:'event',u:1,kind:'orientation'})),...Array.from({length:74},()=>({t:'1.1',u:1}))]};
   const def={...actual.def,range:{start:[2026,8,14],end:[2026,9,30]},daysOff:[],earlyRelease:[],pacing,
     periods:{B:{meetsDays:[1,2,3,4,5]},E:actual.def.periods.E}};
   const countWeeks=rows=>{
     const counts=new Map();
     for(const r of rows.filter(r=>r[4]?.group)){
       const d=new Date(r[0],r[1],r[2]);d.setDate(d.getDate()-d.getDay()+1);
       counts.set(+d,(counts.get(+d)||0)+1);
     }
     return [...counts.values()];
   };
   expect(Math.max(...countWeeks(actual.generateSchedule(def)))).toBe(2);
   def.periods.E={...def.periods.E,maxPairsPerWeek:3};
   expect(Math.max(...countWeeks(actual.generateSchedule(def)))).toBe(3);
 });
 it('keeps lag at no more than nine pacing items on the real calendar',()=>{
   let b=0,e=0,maxLag=0;
   for(const r of S){
     if(r[3]&&typeof r[3]==='object'&&r[3].kind!=='work')b+=(r[3].group||[r[3]]).length;
     if(r[4]&&typeof r[4]==='object')e+=(r[4].group||[r[4]]).length;
     maxLag=Math.max(maxLag,b-e);
   }
   expect(maxLag).toBeLessThanOrEqual(9);
 });
});

describe('group consumers',()=>{
 it('counts 66 lessons and maps both members to the same date',()=>{
   const s=load(['_orderedPeriodTopics','_computePace','_lessonDateMap'],{S,cP:'E',localLessonState:()=>''});
   expect(s._orderedPeriodTopics()).toContain(first.t);
   expect(s._computePace(s._orderedPeriodTopics(),{},S,+new Date(2026,8,16),'E')).toEqual({done:0,total:66,expected:5});
   const dates=s._lessonDateMap();expect(+dates['1.4']).toBe(+dates['1.5']);
 });
 it('requires both members through the unchanged local oracle; joined marks do not substitute',()=>{
   const s=load(['localLessonState','_isLessonComplete','_orderedPeriodTopics','calNextUpTopic'],{S,cP:'E',getRegistryEntry:()=>({urls:{worksheet:'sheet',blooket:'cards'}})});
   const marks={'1.4|worksheet':{ts:1},'1.4|blooket':{ts:1},[first.t+'|worksheet']:{ts:1},[first.t+'|blooket']:{ts:1}};
   expect(s._isLessonComplete(first.t,marks)).toBe(false);expect(s.localLessonState(first.t,marks)).toBe('partial');
   expect(s.calNextUpTopic([first.t,'1.6'],marks)).toBe(first.t);
   marks['1.5|worksheet']={ts:1};marks['1.5|blooket']={ts:1};
   expect(s._isLessonComplete(first.t,marks)).toBe(true);expect(s.localLessonState(first.t,marks)).toBe('done');
   expect(s.calNextUpTopic([first.t,'1.6'],marks)).toBe('1.6');
 });
 it('does not complete a group when the second server lesson is missing',()=>{
   const data={lessons:[{lesson:'1.4',lessonState:'done'}]};
   const s=load(['donowCellState','donowLessonCovers'],{S,_donowData:data});
   expect(s.donowCellState(first.t)).toBe('partial');data.lessons.push({lesson:'1.5',lessonState:'done'});expect(s.donowCellState(first.t)).toBe('done');
 });
 it('retains archived combined rendering and completion',()=>{
   const s=load(['htm','cls','_isLessonComplete'],{cYear:'SY25-26',getRegistryEntry:()=>({urls:{worksheet:'sheet'}})});
   const c=s.d('6.4+6.5','Tests + p-Values',6,'','',true);
   expect(s.htm(c,'Mar 11')).toContain('6.4+6.5');expect(s.htm(c,'Mar 11')).toContain('2x');expect(s.cls(c)).toBe('cell-u6');
   expect(s._isLessonComplete(c.t,{[c.t+'|worksheet']:{ts:1}})).toBe(true);
 });
 it('renders both labels, unit color and 2x',()=>{
   const s=load(['htm','cls','cellAria','_resourcePanelEsc'],{S});
   const rendered=s.htm(first,'Sep 16');for(const m of first.group)expect(rendered).toContain(s.cedLabel(m.t).text);
   expect(rendered).toContain('2x');expect(s.cls(first)).toBe('cell-u1');expect(s.cellAria(first,'Sep 16')).toContain('double topic day');
 });
 it('chooses the first mapped calculator member',()=>{
   const s=load(['_ti84TodayTopic'],{S,_todayLessonInf:first,_ti84LessonMap:{'1.5':['x']}});expect(s._ti84TodayTopic()).toBe('1.5');
 });
});
function page(){return new JSDOM('<div id="resource-header"></div><div id="resource-body"></div><div id="resource-overlay"></div><div id="donow-card"><div class="donow-body"></div></div><input id="ogm-lesson-key"><input id="ogm-reason"><span id="ogm-status"></span><button id="ogm-confirm"></button>',{url:'https://desk.example/'});}
describe('group resources and override',()=>{
 it('renders both resources with individual progress keys and unique IDs; lists both due today',()=>{
   const dom=page(),lessons={},resources={};
   for(const m of first.group){lessons[m.t]={urls:{worksheet:'u1_lesson'+m.t.split('.')[1]+'_live.html'},periods:{}};resources[m.t]={videos:[{url:'https://video.example/'+m.t}]};}
   const s=load(['showResourcePanel','_lessonCoachHtml','_resourcePanelEsc','_renderTodayTopics','_focusTodayLessonVideo'],{
     S,window:dom.window,document:dom.window.document,location:dom.window.location,cP:'E',_lastResourcePanel:null,_todayLessonInf:first,_todayLessonDS:'Sep 16',_gradeLessonsCache:[],
     REGISTRY:{lessons},RESOURCES:resources,AI_TUTOR_LESSON_KEYS:new Set(['1.4','1.5']),lookupTopic:t=>t,getRegistryEntry:t=>lessons[t],getAllRegistryEntries:t=>[lessons[t]],
     getStudentEmail:()=> 'fixture',getStudentMarks:()=>({}),_deskIsTeacher:()=>false,cedTeacherBridgeAllowed:()=>false,_isApClassroomAvailable:()=>true,_wsCompletionFor:()=>null,_getCwsForTopic:()=>null,DESK_WORKSHEET_DONE_THRESHOLD:60
   });
   try{
     s.showResourcePanel(first,'Sep 16');const d=dom.window.document;
     expect([...d.querySelectorAll('a[href^="https://video.example/"]')].map(a=>a.href)).toEqual(['https://video.example/1.4','https://video.example/1.5']);
     expect([...d.querySelectorAll('.worksheet-done-slot')].map(e=>e.dataset.topic)).toEqual(['1.4','1.5']);
     const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);
     expect(d.querySelectorAll('[id^="ai-tutor-status-"]')).toHaveLength(2);
     expect(d.querySelectorAll('a[href^="dok/"]')).toHaveLength(0);expect(s._lastResourcePanel.inf).toBe(first);
     s._renderTodayTopics();s._renderTodayTopics();expect(d.querySelectorAll('#donow-today-topics')).toHaveLength(1);
     for(const m of first.group)expect(d.getElementById('donow-today-topics').textContent).toContain(s.cedLabel(m.t).text);
     d.getElementById('donow-today-topics').click();expect(s._lastResourcePanel.inf).toBe(first);
     s._deskIsTeacher=()=>true;
     s.showResourcePanel(first,'Sep 16');
     expect(d.querySelectorAll('a[href^="dok/"]')).toHaveLength(0);
     expect(d.querySelectorAll('a[href="dok/pdf/aps_1.4_student.pdf"]')).toHaveLength(0);
   }finally{dom.window.close();}
 });
 it('requires both override keys',()=>{
   const keys=['1.4'];const s=load(['_isTopicLessonUnlocked'],{S,_readLessonUnlocks:()=>keys});
   expect(s._isTopicLessonUnlocked(first.t)).toBe(false);keys.push('1.5');expect(s._isTopicLessonUnlocked(first.t)).toBe(true);
 });
 it('posts both keys and preserves successful partial results for retry',async()=>{
   const dom=page(),posted=[];let fail=true;const d=dom.window.document;d.getElementById('ogm-lesson-key').value=first.t;
   dom.window.ROSTER_SERVICE_URL='https://roster.example';dom.window.rosterClient={token:()=> 'fixture'};
   const s=load(['_confirmOverrideGate'],{S,window:dom.window,document:d,sessionStorage:dom.window.sessionStorage,_viewAsContext:()=>({username:'fixture'}),_hideOverrideGateModal:()=>{},setTimeout:()=>{},
     fetch:async(url,options)=>{const key=JSON.parse(options.body).lessonKey;posted.push(key);return {ok:!(fail&&key==='1.5'),json:async()=>({ok:!(fail&&key==='1.5')})};}});
   try{await s._confirmOverrideGate();expect(posted).toEqual(['1.4','1.5']);expect(JSON.parse(dom.window.sessionStorage.getItem('apstats_view_as_lesson_unlocks'))).toEqual(['1.4']);
     fail=false;await s._confirmOverrideGate();expect(posted).toEqual(['1.4','1.5','1.5']);expect(JSON.parse(dom.window.sessionStorage.getItem('apstats_view_as_lesson_unlocks'))).toEqual(['1.4','1.5']);
   }finally{dom.window.close();}
 });
});
