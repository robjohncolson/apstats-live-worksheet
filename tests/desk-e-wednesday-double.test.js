// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

describe('E Wednesday double block',()=>{
  it('preserves the captured pre-change B column byte for byte in both JSON copies',()=>{
    for(const path of ['data/lesson-schedule.json','roster-server/data/lesson-schedule.json']){
      const column=readFileSync(path,'utf8').split(/\r?\n/).filter(line=>/^\s*"B":/.test(line)&&!/^\s*"B": \[\]/.test(line)).join('\n');
      expect(createHash('sha256').update(column).digest('hex')).toBe('a212bb52dcca76c7b968a9b07eb882c80fa20432df6f589c84defb70bbc7f142');
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
  for(const name of ['SY2627_PACING_B','SY2627_PACING_E']){const n=constant(name);runInContext('var '+name+'='+source.slice(n.start,n.end),s);}
  const n=constant('SCHEDULE_DEFS').properties.find(p=>p.key.value==='SY26-27').value;
  runInContext('var def='+source.slice(n.start,n.end)+';var S=generateSchedule(def);',s);
  return s;
}
const actual=generated();
const S=actual.S;
const first=S.find(row=>row[4]?.group)[4];
const pairs=[
 ['2026-09-16','1.4+1.5',1],['2026-09-23','1.7+1.8',1],['2026-10-07','3.5+3.6',1],
 ['2026-10-28','4.2+4.3',2],['2026-12-16','6.2+6.3',3],['2027-01-06','5.6+6.8',3],
 ['2027-01-20','8.4+8.5',3],['2027-02-03','7.1+7.2',4],['2027-02-24','7.7+7.8',4],['2027-03-10','2.5+2.6',5]
];
const iso=row=>row[0]+'-'+String(row[1]+1).padStart(2,'0')+'-'+String(row[2]).padStart(2,'0');
describe('real extracted Wednesday generator',()=>{
 it('reproduces the entire acceptance table',()=>expect(S.filter(r=>r[4]?.group).map(r=>[iso(r),r[4].t,r[4].u])).toEqual(pairs));
 it('leaves every B cell identical to the original single-block rule',()=>{
   const old=actual.generateSchedule({...actual.def,periods:{...actual.def.periods,E:{...actual.def.periods.E,doubleFrom:null}}});
   expect(JSON.stringify(S.map(r=>r.slice(0,4)))).toBe(JSON.stringify(old.map(r=>r.slice(0,4))));
 });
 it('preserves the full shape, order and member keys',()=>{
   for(const row of S.filter(r=>r[4]?.group)){
     const c=row[4];expect(c.db).toBe(true);expect(c.t).toBe(c.group.map(m=>m.t).join('+'));
     expect(c.n).toBe(c.group.map(m=>m.n).join(' + '));
     for(const m of c.group)expect(Object.keys(m)).toEqual(expect.arrayContaining(['t','n','u','due','as','db','ced']));
   }
 });
 it('never doubles B, early releases, past Wednesdays, events, or across units',()=>{
   for(const row of S){expect(row[3]?.group).toBeUndefined();if(!row[4]?.group)continue;
     expect(new Date(row[0],row[1],row[2]).getDay()).toBe(3);expect(iso(row)>='2026-09-14').toBe(true);
     expect(actual.def.earlyRelease.some(d=>d.join('-')===row.slice(0,3).join('-'))).toBe(false);
     expect(row[4].group.every(m=>!m.kind&&m.u>0&&m.u===row[4].u)).toBe(true);
   }
 });
 it.each(['orientation','poster','pc','baseline','review'])('does not pair an event of kind %s',kind=>{
   const def={...actual.def,range:{start:[2026,8,16],end:[2026,8,16]},pacing:{B:[],E:[{t:'1.4',n:'a',u:1},{t:'event',n:'event',u:1,kind}]}};
   expect(actual.generateSchedule(def)[0][4].group).toBeUndefined();
 });
 it('does not pair across a unit boundary or with an untyped review',()=>{
   for(const next of [{t:'2.1',u:2},{t:'review',u:0}]){
     const def={...actual.def,range:{start:[2026,8,16],end:[2026,8,16]},pacing:{B:[],E:[{t:'1.4',n:'a',u:1},next]}};
     expect(actual.generateSchedule(def)[0][4].group).toBeUndefined();
   }
 });
 it('reproduces five PC Day 2 dates and the review end',()=>{
   expect(S.filter(r=>r[4]?.kind==='pc'&&r[4].admin===2).map(iso)).toEqual(['2026-10-16','2026-12-07','2027-01-29','2027-03-05','2027-03-22']);
   expect(S.filter(r=>r[4]?.t==='review').map(iso).at(-1)).toBe('2027-03-31');
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
   const s=load(['showResourcePanel','_lessonCoachHtml','_resourcePanelEsc','_dokLadderRowHtml','_renderTodayTopics','_focusTodayLessonVideo'],{
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
