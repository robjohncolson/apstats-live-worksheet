// @vitest-environment node
// Poster-day tiles / Do Now open the group sheets + example poster (POSTER_LINKS);
// the teacher key renders only for a signed-in teacher.
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
const day1={t:'U1-Poster',n:'Unit 1 Poster',u:1,kind:'poster'};
const day2={t:'U1-Poster2',n:'Unit 1 Poster (Day 2)',u:1,kind:'poster',admin:2};
const unlinked={t:'U5-Poster',n:'Unit 5 Poster',u:5,kind:'poster'};
function page(today,teacher){
 const dom=new JSDOM('<div id="resource-header"></div><div id="resource-body"></div><div id="resource-overlay" style="display:none"></div><div id="tip"></div><div id="donow-card"><div class="donow-body"><div id="donow-msg"></div></div></div>',{url:'https://desk.example/'});
 const globals={R:'review',OFF:'off',EX:'exam',PO:'post',NC:'noclass',cYear:'SY26-27',cP:'B',window:dom.window,document:dom.window.document,
  _lastResourcePanel:null,_todayLessonInf:today,_donowData:null,tdy:()=>new Date(2026,9,8),getStudentEmail:()=>'',getStudentMarks:()=>({}),
  getRegistryEntry:()=>null,getAllRegistryEntries:()=>[],tip:dom.window.document.getElementById('tip'),DN:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']};
 if(teacher)globals.cedTeacherBridgeAllowed=()=>true;
 const s=createContext(globals);
 for(const path of ['js/ced2026-crosswalk.js','js/ced2026-labels.js'])runInContext(readFileSync(path,'utf8'),s);
 runInContext([decl('PC_LINKS'),decl('POSTER_LINKS'),...['posterLinksFor','groupTopics','groupLabel','_showProgressCheckPanel','_showPosterPanel','_showWorkDayPanel','_showBreakDayPanel','showResourcePanel','sTip','_resourcePanelEsc','renderDoNow','localLessonState'].map(fn)].join('\n'),s);
 return {dom,s};
}
describe('Poster-day links',()=>{
 it('U1 has two student PDFs and one teacher PDF, repo-relative; day 2 shares the entry',()=>{
  const {s}=page(day1);
  const links=s.POSTER_LINKS['U1-Poster'];
  expect(links.student.map(l=>l.url)).toEqual(['u1_poster/pdf/u1_poster_group_sheets_student.pdf','u1_poster/pdf/u1_poster_example_board_demo.pdf']);
  expect(links.teacher.map(l=>l.url)).toEqual(['u1_poster/pdf/u1_poster_teacher_key.pdf']);
  expect(s.posterLinksFor('U1-Poster2')).toBe(links);
  expect(s.posterLinksFor('U5-Poster')).toBeNull();
 });
 it('a student sees the group sheets and the example, never the key',()=>{
  const {dom,s}=page(day1);try{
   s.showResourcePanel(day1,'Oct 8');const d=dom.window.document;
   expect(d.getElementById('resource-overlay').style.display).toBe('block');
   expect(d.getElementById('resource-header').textContent).toBe('Unit 1 Poster');
   const hrefs=[...d.querySelectorAll('#resource-body a')].map(a=>a.getAttribute('href'));
   expect(hrefs).toEqual(['u1_poster/pdf/u1_poster_group_sheets_student.pdf','u1_poster/pdf/u1_poster_example_board_demo.pdf']);
   for(const a of d.querySelectorAll('#resource-body a')){expect(a.target).toBe('_blank');expect(a.rel).toBe('noopener');}
   expect(d.getElementById('resource-body').textContent).not.toContain('Teacher');
   expect(d.querySelector('.poster-teacher-only')).toBeNull();
  }finally{dom.window.close();}
 });
 it('a signed-in teacher also gets the key under a "Teacher only" label; day 2 too',()=>{
  const {dom,s}=page(day2,true);try{
   s.showResourcePanel(day2,'Oct 9');const d=dom.window.document;
   expect(d.getElementById('resource-header').textContent).toBe('Unit 1 Poster (Day 2)');
   const hrefs=[...d.querySelectorAll('#resource-body a')].map(a=>a.getAttribute('href'));
   expect(hrefs).toEqual(['u1_poster/pdf/u1_poster_group_sheets_student.pdf','u1_poster/pdf/u1_poster_example_board_demo.pdf','u1_poster/pdf/u1_poster_teacher_key.pdf']);
   expect(d.querySelector('.poster-teacher-only').textContent).toBe('Teacher only');
  }finally{dom.window.close();}
 });
 it('an unlinked poster unit still opens a panel, without links',()=>{
  const {dom,s}=page(unlinked,true);try{
   s.showResourcePanel(unlinked,'Mar 11');const d=dom.window.document;
   expect(d.querySelector('#resource-body a')).toBeNull();
   expect(d.getElementById('resource-body').textContent).toContain('hands out the group sheets');
  }finally{dom.window.close();}
 });
 it('tooltip says the tile opens the sheets',()=>{
  const {dom,s}=page(day1);try{
   s.sTip({},new Date(2026,9,8),day1,'Oct 8');expect(s.tip.textContent).toContain('Click for the group sheets');
   s.sTip({},new Date(2027,2,11),unlinked,'Mar 11');expect(s.tip.textContent).toContain('Groups of three');
  }finally{dom.window.close();}
 });
 it('Do Now names the poster day and points at the tile',async()=>{
  const {dom,s}=page(day2);try{
   dom.window.rosterClient={current:()=>({}),token:()=>'fixture'};dom.window.ROSTER_SERVICE_URL='https://roster.example';
   s.fetch=async()=>({json:async()=>({ok:true,nextTask:{lesson:'2.1',unit:2}})});
   await s.renderDoNow();const msg=dom.window.document.getElementById('donow-msg').textContent;
   expect(msg).toContain('Unit 1 Poster (Day 2)');expect(msg).toContain('groups of three');expect(msg).toContain('tile');
  }finally{dom.window.close();}
 });
});
