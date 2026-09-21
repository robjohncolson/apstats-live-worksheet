// @vitest-environment node
// Progress Check tiles / Do Now open the AP Classroom assignment (PC_LINKS).
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {parse} from 'acorn';
import {JSDOM} from 'jsdom';
const html=readFileSync('ap_stats_roadmap_square_mode.html','utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function showResourcePanel'))[1];
const ast=parse(source,{ecmaVersion:'latest'});
function fn(name){const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return source.slice(n.start,n.end);}
function decl(name){const n=ast.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name===name).init;return 'var '+name+'='+source.slice(n.start,n.end);}
const pcA={t:'U1-PCA',n:'Unit 1 MCQ Part A',u:1,kind:'pc',part:'A'};
const pc2={t:'U9-PC2',n:'Unit 9 Progress Check (Day 2)',u:9,kind:'pc',admin:2};
function page(today){
 const dom=new JSDOM('<div id="resource-header"></div><div id="resource-body"></div><div id="resource-overlay" style="display:none"></div><div id="tip"></div><div id="donow-card"><div class="donow-body"><div id="donow-msg"></div></div></div>',{url:'https://desk.example/'});
 const s=createContext({R:'review',OFF:'off',EX:'exam',PO:'post',NC:'noclass',cYear:'SY26-27',cP:'B',window:dom.window,document:dom.window.document,
  _lastResourcePanel:null,_todayLessonInf:today,_donowData:null,tdy:()=>new Date(2026,8,21),getStudentEmail:()=>'',getStudentMarks:()=>({}),
  getRegistryEntry:()=>null,getAllRegistryEntries:()=>[],tip:dom.window.document.getElementById('tip'),DN:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']});
 for(const path of ['js/ced2026-crosswalk.js','js/ced2026-labels.js'])runInContext(readFileSync(path,'utf8'),s);
 runInContext([decl('PC_LINKS'),...['groupTopics','groupLabel','_showProgressCheckPanel','_showWorkDayPanel','_showBreakDayPanel','showResourcePanel','sTip','_resourcePanelEsc','renderDoNow','localLessonState'].map(fn)].join('\n'),s);
 return {dom,s};
}
describe('Progress Check launch links',()=>{
 it('U1 MCQ Part A points at the AP Classroom assignment',()=>{
  const {s}=page(pcA);
  expect(s.PC_LINKS['U1-PCA'].url).toBe('https://apclassroom.collegeboard.org/33/assignments?quizId=21010399&type=');
 });
 it('the tile opens a panel with an AP Classroom link, new tab, no resource rows',()=>{
  const {dom,s}=page(pcA);try{
   s.showResourcePanel(pcA,'Sep 21');const d=dom.window.document;
   expect(d.getElementById('resource-overlay').style.display).toBe('block');
   expect(d.getElementById('resource-header').textContent).toBe('Unit 1 MCQ Part A');
   const a=d.querySelector('#resource-body a');
   expect(a.href).toBe(s.PC_LINKS['U1-PCA'].url);expect(a.target).toBe('_blank');expect(a.rel).toBe('noopener');
   expect(d.getElementById('resource-body').textContent).toContain('College Board');
   expect(d.getElementById('resource-body').textContent).toContain('paper copy');
  }finally{dom.window.close();}
 });
 it('an unlinked PC day still opens a panel, without a link',()=>{
  const {dom,s}=page(pc2);try{
   s.showResourcePanel(pc2,'Jun 1');const d=dom.window.document;
   expect(d.querySelector('#resource-body a')).toBeNull();
   expect(d.getElementById('resource-body').textContent).toContain('teacher shares the link');
  }finally{dom.window.close();}
 });
 it('tooltip says the tile opens AP Classroom',()=>{
  const {dom,s}=page(pcA);try{
   s.sTip({},new Date(2026,8,21),pcA,'Sep 21');expect(s.tip.textContent).toContain('Click to open in AP Classroom');
   s.sTip({},new Date(2027,5,1),pc2,'Jun 1');expect(s.tip.textContent).toContain('Taken in AP Classroom');
  }finally{dom.window.close();}
 });
 it('Do Now names the PC and points at the tile',async()=>{
  const {dom,s}=page(pcA);try{
   dom.window.rosterClient={current:()=>({}),token:()=>'fixture'};dom.window.ROSTER_SERVICE_URL='https://roster.example';
   s.fetch=async()=>({json:async()=>({ok:true,nextTask:{lesson:'1.7',unit:1}})});
   await s.renderDoNow();const msg=dom.window.document.getElementById('donow-msg').textContent;
   expect(msg).toContain('Unit 1 MCQ Part A');expect(msg).toContain('AP Classroom');expect(msg).toContain('tile');
  }finally{dom.window.close();}
 });
});
