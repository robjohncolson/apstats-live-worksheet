// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {parse} from 'acorn';
import {JSDOM} from 'jsdom';
const html=readFileSync('ap_stats_roadmap_square_mode.html','utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function showResourcePanel'))[1];
const ast=parse(source,{ecmaVersion:'latest'});
function fn(name){const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return source.slice(n.start,n.end);}
function load(names,globals={}){
 const s=createContext({R:'review',OFF:'off',EX:'exam',PO:'post',NC:'noclass',cYear:'SY26-27',cP:'B',MN:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],...globals});
 const win=s.window;s.window=s;
 for(const path of ['js/ced2026-crosswalk.js','js/ced2026-labels.js'])runInContext(readFileSync(path,'utf8'),s);
 if(win)s.window=win;
 runInContext([...new Set(['d','groupTopics','groupLabel',...names])].map(fn).join('\n'),s);
 return s;
}
function generated(){
 const s=load(['dateFromArr','buildOffSet','enumWeekdays','injectPcPosterEvents','generateSchedule']);
 for(const name of ['SY2627_PACING_B','SY2627_PACING_E','VIDEO_MINUTES','SCHEDULE_DEFS']){
  const n=ast.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name===name).init;
  runInContext('var '+name+'='+source.slice(n.start,n.end),s);
 }
 runInContext('var def=SCHEDULE_DEFS["SY26-27"];var S=generateSchedule(def)',s);
 return s;
}
const actual=generated(),S=actual.S;
const iso=r=>r[0]+'-'+String(r[1]+1).padStart(2,'0')+'-'+String(r[2]).padStart(2,'0');
const fixture=[['2026-10-13','2.1'],['2026-10-19','2.3'],['2026-11-13','5.2'],['2026-12-11','6.6'],['2026-12-18','6.8'],['2027-01-08','8.4'],['2027-01-22','5.7'],['2027-02-05','7.6'],['2027-02-12','7.9'],['2027-03-01','2.4'],['2027-03-19','review']];
const work=S.find(r=>r[3]?.kind==='work')[3];
describe('B Work Day generator',()=>{
 it('reproduces all eleven dates and the next queued lesson, including Review 1',()=>{
  expect(S.flatMap((r,i)=>r[3]?.kind==='work'?[[iso(r),S.slice(i+1).find(n=>typeof n[3]==='object')[3].t]]:[])).toEqual(fixture);
  expect(S.find(r=>iso(r)==='2027-03-22')[3].n).toBe(actual.def.pacing.B.at(-1).n);
  expect(work).toEqual({t:'B-Work',n:'Work Day',u:0,kind:'work',due:'',as:''});
 });
 it('counts no pacing item on work days, never displaces events, and respects the weekly limit',()=>{
  let b=0,e=0;const weeks=new Set();
  const placed=[];
  for(const r of S){
   const cell=r[3];
   if(cell?.kind==='work'){
    expect(b-e).toBeGreaterThanOrEqual(2);
    expect(actual.def.pacing.B[b].kind).toBeUndefined();
    expect(iso(r)>='2026-10-13').toBe(true);
    const monday=new Date(r[0],r[1],r[2]);monday.setDate(monday.getDate()-monday.getDay()+1);
    expect(weeks.has(+monday)).toBe(false);weeks.add(+monday);
   }else if(typeof cell==='object'){placed.push(cell.t);b++;}
   const ec=r[4];if(typeof ec==='object')e+=(ec.group||[ec]).length;
  }
  expect(placed).toEqual(actual.def.pacing.B.map(c=>c.t));
  expect(b).toBe(actual.def.pacing.B.length);
 });
 it.each(['orientation','poster','pc','baseline'])('does not insert work before %s even with a large lead',kind=>{
  const pacing={B:[{t:'1.1',u:1},{t:'1.2',u:1},{t:'event',kind,u:1}],E:[]};
  const def={...actual.def,range:{start:[2026,8,14],end:[2026,8,18]},daysOff:[],pacing};
  expect(actual.generateSchedule(def).filter(r=>r[3]?.kind==='work')).toHaveLength(0);
 });
 it('preserves legacy definitions and their generated calendars',()=>{
  for(const key of ['SUMMER26','SY25-26']){
   const def=actual.SCHEDULE_DEFS[key];expect(def.periods.B.workDayFrom).toBeUndefined();
   if(def._legacyS){expect(def._legacyS.some(r=>r[3]?.kind==='work')).toBe(false);continue;}
   const legacy=actual.generateSchedule(def);
   expect(legacy.some(r=>r[3]?.kind==='work')).toBe(false);
   expect(legacy.filter(r=>typeof r[3]==='object').map(r=>r[3].t)).toEqual(def.pacing.B.map(c=>c.t));
  }
 });
 it('emits corrected unit ends, review ends and additive JSON workDays with no lesson entry',()=>{
  const ends={B:['2026-10-09','2026-11-24','2027-01-21','2027-02-26','2027-03-15'],E:['2026-10-16','2026-11-30','2027-01-25','2027-03-03','2027-03-17']};
  for(const path of ['data/lesson-schedule.json','roster-server/data/lesson-schedule.json']){
   const json=JSON.parse(readFileSync(path,'utf8'));
   expect(json.schemaVersion).toBe(2);expect(json.calendar.workDays).toEqual({B:fixture.map(r=>r[0]),E:[]});
   expect(json.lessons['B-Work']).toBeUndefined();expect(json.dayGroups.B).toEqual([]);
   expect(json.dayGroups.E).toEqual(S.filter(r=>r[4]?.group).map(r=>r[4].group.map(m=>m.t)));
   for(const [p,col] of [['B',3],['E',4]]){
    expect(S.filter(r=>r[col]?.kind==='pc'&&r[col].admin===2).map(iso)).toEqual(ends[p]);
    expect(Object.values(json.progressChecks).map(pc=>pc.adminDay2[p])).toEqual(ends[p]);
    expect(S.filter(r=>r[col]?.t==='review').map(iso).at(-1)).toBe(p==='B'?'2027-03-22':'2027-03-24');
   }
  }
 });
});
const consumerNames=['localLessonState','donowCellState','donowLessonCovers','_isLessonComplete','calNextUpTopic','_orderedPeriodTopics','_workDayNextLesson','_showWorkDayPanel','showResourcePanel','_computePace','rProg','cls','htm','cellAria','sTip','_resourcePanelEsc','updateLegend','renderDoNow'];
function page(){
 const dom=new JSDOM('<div id="pb"></div><div id="pl"></div><div id="legend-bar"></div><div id="resource-header"></div><div id="resource-body"></div><div id="resource-overlay" style="display:none"></div><div id="tip"></div><div id="donow-card"><div class="donow-body"><div id="donow-msg"></div></div></div>',{url:'https://desk.example/'});
 const s=load(consumerNames,{S,window:dom.window,document:dom.window.document,_lastResourcePanel:null,_todayLessonInf:work,_donowData:null,
  SCHEDULE_DEFS:actual.SCHEDULE_DEFS,tdy:()=>new Date(2026,9,13),getStudentEmail:()=>'',getStudentMarks:()=>({}),getRegistryEntry:()=>({urls:{worksheet:'sheet',blooket:'cards'}}),tip:dom.window.document.getElementById('tip'),DN:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']});
 return {dom,s};
}
describe('real Work Day Desk consumers',()=>{
 it('renders the tile, aria, tooltip and SY26-27-only legend',()=>{
  const {dom,s}=page();try{
   expect(s.cls(work)).toBe('cell-work');expect(s.htm(work,'Oct 13')).toContain('Work Day');
   const copy='Work Day — catch up on follow-alongs, flashcards, quiz retakes, and exit tickets (bonus)';
   expect(s.cellAria(work,'Oct 13')).toContain(copy);s.sTip({},new Date(2026,9,13),work,'Oct 13');expect(s.tip.textContent).toContain(copy);
   expect(html).toMatch(/\.cell-work\s*\{[^}]*dotted/);
   for(const key of ['SY26-27','SUMMER26','SY25-26']){s.updateLegend(actual.SCHEDULE_DEFS[key]);expect(dom.window.document.getElementById('legend-bar').textContent.includes('Work Day')).toBe(key==='SY26-27');}
  }finally{dom.window.close();}
 });
 it('skips the gate, never greys even with stray local/server marks, and excludes pace/progress',()=>{
  const {dom,s}=page();try{
   const marks={'B-Work|worksheet':{ts:1}};s._donowData={lessons:[{lesson:'B-Work',lessonState:'done'}]};
   expect(s._isLessonComplete('B-Work',marks)).toBe(true);expect(s.localLessonState('B-Work',marks)).toBe('');expect(s.donowCellState('B-Work')).toBe('');
   expect(s.calNextUpTopic(['B-Work','1.1'],marks)).toBe('1.1');
   const topics=s._orderedPeriodTopics();const noWork=S.filter(r=>r[3]?.kind!=='work');
   const pace=s._computePace(topics,{},S,+new Date(2027,3,1),'B');expect(pace.total).toBe(66);expect(pace.expected).toBe(66);
   expect(pace).toEqual(s._computePace(topics,{},noWork,+new Date(2027,3,1),'B'));
   s.rProg();const before=dom.window.document.getElementById('pb').innerHTML;s.S=noWork;s.rProg();expect(dom.window.document.getElementById('pb').innerHTML).toBe(before);
  }finally{dom.window.close();}
 });
 it('opens catch-up resources and routes Finish to the earliest incomplete lesson',()=>{
  const {dom,s}=page();try{
   s.getStudentMarks=()=>({'1.1|worksheet':{ts:1},'1.1|blooket':{ts:1}});
   s.showResourcePanel(work,'Oct 13');const d=dom.window.document;
   expect(d.getElementById('resource-overlay').style.display).toBe('block');expect(d.getElementById('resource-body').textContent).toContain('Exit tickets are bonus (+5)');
   const next=s._workDayNextLesson();expect(next.inf.t).toBe('1.2');expect(d.querySelector('#resource-body button').textContent).toBe('Finish: '+s.cedLabel('1.2').text);
   let opened;s.showResourcePanel=(inf)=>{opened=inf.t;};d.querySelector('#resource-body button').click();expect(opened).toBe('1.2');
  }finally{dom.window.close();}
 });
 it('renders Work Day Do Now copy from the earliest-gap walk without a due chip',async()=>{
  const {dom,s}=page();try{
   dom.window.rosterClient={current:()=>({}),token:()=> 'fixture'};dom.window.ROSTER_SERVICE_URL='https://roster.example';
   s.fetch=async()=>({json:async()=>({ok:true,nextTask:{lesson:'1.5',unit:1}})});
   await s.renderDoNow();const msg=dom.window.document.getElementById('donow-msg').textContent;
   expect(msg).toContain('Work Day — nothing new today.');expect(msg).toContain('Finish: '+s.cedLabel('1.1').text);expect(msg).toContain('Exit tickets are bonus (+5)');expect(dom.window.document.querySelector('#donow-today-topics')).toBeNull();
  }finally{dom.window.close();}
 });
});
