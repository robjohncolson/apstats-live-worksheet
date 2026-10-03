import { profileFor, createFixedStep } from './physics.mjs';
import { createPicoScene } from './pico-scene.mjs';
import { toPose } from './pico-rules.mjs';

// The calendar strip's height; a level taller than this grows the board while it is open.
export const BASE_BOARD_H = 220;
const CAT_H = 24, CALENDAR_DOOR_X = 43;

// All seven relay levels share the calendar canvas, sprites and input; the calendar's one door opens 6.
export const LEVEL_TITLES = ['Hello together','Switchback','Lift relay','Moving walls','Upstairs / downstairs','Weight together','Jump together'];

// Usernames inside a level, for a door label. At most `max` names, then "+N".
export function occupantLabel(names, max = 2) {
  const list = (names || []).filter(name => typeof name === 'string' && name);
  if (!list.length) return '';
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? shown + ' +' + (list.length - max) : shown;
}

// Usernames inside `levelIndex` from a park_lobby reply, excluding the viewer
// (a second tab of their own is not a teammate).
export function occupantsOf(levels, levelIndex, member) {
  const row = (Array.isArray(levels) ? levels : []).find(item => item && item.levelIndex === levelIndex);
  return ((row && row.online) || []).filter(name => typeof name === 'string' && name && name !== member);
}

// The puzzle doors live on the calendar board (classroom-board.js draws them and
// polls park_lobby); this scene is always one level. Every exit returns to the calendar.
export function mountBoardScene({ board, replica, member, onExit, completed = [], remember = () => {}, status, connected }) {
  const { engine, input, api } = board;
  const entities = new Map(), peers = {};
  const oldCamera = {...api._camera}, holdSent = new Map(), moving = new Map();
  let level=null, terrain=[], lift=null, disposed=false, lastLevel=null, returnWalk=0, lastRest=null, retrying=false, wasArrived=false;
  let pushAt=0, pushing=null, pico=null;
  // Fall wrap state: where the cat last stood on solid ground, and whether it is
  // mid-drop from the top (steering locked until it lands).
  let lastGround=null, wrapDrop=null;
  const keyImage = new Image();keyImage.src='key.png';
  const pose = ()=>({x:player.x,y:player.y,vx:player.vx,vy:player.vy});
  // Before the relay sends a level, the calendar door and floor come from the board itself.
  const floorY = ()=>level ? level.exit.y+CAT_H : engine.groundY;
  const exitSpot = ()=>level?.exit || {x:CALENDAR_DOOR_X,y:floorY()-CAT_H};
  // Level 6 (physics 'pico') compares relay poses: toPose() is the one sprite<->pose conversion.
  const here = ()=>pico&&level?.physics==='pico'?toPose(player):player;
  const near = item=>{if(!item)return false;const at=here();return Math.hypot(at.x-item.x,at.y-item.y)<22;};
  const onPad = item=>Math.abs(player.x-item.x)<20 && Math.abs(player.y-item.y)<3 && player.vy>=0;
  const player = board.createPlayer({x:90,y:floorY()-CAT_H,input,terrain:()=>terrain,peers:()=>peers,canvasW:()=>level?.width || 960,onUpPressed:act,physics:profileFor(null)});
  player.engine=engine;
  Object.assign(api._camera,{x:0,enabled:true,followFn:()=>player,levelWFn:()=>Math.max(level?.width || 960,board.viewportW()),vwFn:board.viewportW,cameraStateFn:()=>null});
  function act() {
    if(disposed)return;
    if(near(exitSpot())){onExit();return;}
    if(pico&&level?.physics==='pico'){pico.act();return;}
    if(!level || !near(level.goal) || !replica.state.running)return;
    const p=replica.state.progress;
    if(p.arrived.includes(member)){onExit();return;}
    if(p.doorOpen)replica.queue('arrive','door',pose());
    else if(p.keyHolder===member)replica.queue('unlock','door',pose());
  }
  function valueAt(state) {
    const t=state.duration?Math.min(1,Math.max(0,(replica.clock()-state.at)/state.duration)):1;
    return typeof state.from==='number'?state.from+(state.to-state.from)*t
      :{x:state.from.x+(state.to.x-state.from.x)*t,y:state.from.y+(state.to.y-state.from.y)*t};
  }
  function liftY() {
    const phase=((replica.clock()%level.lift.cycleMs)+level.lift.cycleMs)%level.lift.cycleMs;
    const t=phase<2000?0:phase<5000?(phase-2000)/3000:phase<7000?1:1-(phase-7000)/3000;
    return level.lift.bottom+(level.lift.top-level.lift.bottom)*t;
  }
  function addMoving(id,tile) {
    const previous=moving.get(id);
    if(previous && !retrying && Math.abs(player.y+24-previous.y)<0.1 && player.vy>=0 && player.x+20>previous.x && player.x<previous.x+previous.w){
      player.x+=tile.x-previous.x;player.y+=tile.y-previous.y;
    }
    if(previous && tile.nodes && player.x+20>tile.x && player.x<tile.x+tile.w && player.y+24>tile.y+1 && player.y<tile.y+tile.h){
      // A pushed block carries a rider or shoves someone beside it; it must
      // never tunnel through a stationary teammate between sparse events.
      const dx=tile.x-previous.x;
      if(dx>0)player.x=tile.x+tile.w;
      else if(dx<0)player.x=tile.x-20;
    }
    moving.set(id,tile);terrain.push(tile);return tile;
  }
  function gateOpen(gate) {
    const p=replica.state.progress;
    if(!gate.holds)return p.gates.includes(gate.id);
    // Release our own pressure immediately; network latency must not let us
    // sprint across a bridge that needs a friend to hold it.
    return gate.holds.some(id=>(p.holds[id]||[]).some(name=>name!==member)
      || level.switches.some(pad=>pad.id===id && onPad(pad) && replica.state.running));
  }
  function ensurePeer(name,anchor) {
    if(!peers[name]){const peer=board.createPeer(name,anchor);peer.engine=engine;peers[name]=peer;
      entities.set('peer:'+name,{zIndex:10,render:ctx=>pico&&level?.physics==='pico'?pico.drawCat(ctx,peer,name):peer.render(ctx),getLabelSpec:()=>peer.getLabelSpec()});}
    return peers[name];
  }
  function dropPeer(name) { entities.delete('peer:'+name);delete peers[name]; }
  function prepare() {
    if(disposed)return;
    const identity=replica.state && replica.state.epoch+'/'+replica.state.level.id;
    if(identity && identity!==lastLevel){
      level=replica.state.level;lastLevel=identity;player.physics=profileFor(level);
      board.setBoardHeight?.(Math.max(BASE_BOARD_H,level.height||0));lastRest=null;retrying=false;wasArrived=false;moving.clear();holdSent.clear();pushing=null;pushAt=0;
      for(const name of Object.keys(peers))dropPeer(name);
      if(level.physics==='pico'){
        // Level 6: PICO PARK 1-1. pico-scene.mjs places the cat (spawn slot / safe re-entry).
        if(!pico){pico=createPicoScene({board,replica,member,player,peers,status,connected,ensurePeer,dropPeer});entities.set('pico-overlay',{zIndex:20,render:ctx=>pico.overlay(ctx)});}
        pico.enter(level);
      } else {
        const saved=replica.state.poses[member];
        Object.assign(player,saved && saved.y<level.height?saved:level.spawn,{vx:0,vy:0,state:'idle',standingOn:null,_hidden:false});
        if(replica.state.progress.arrived.includes(member))Object.assign(player,level.goal);
        if(!saved)player.x+=28*(replica.state.members.indexOf(member)%5);
      }
    }
    if(pico&&level?.physics==='pico'){
      const arrived=replica.state.progress.arrived.includes(member);
      if(wasArrived&&!arrived)pico.enter(level);
      wasArrived=arrived;
      pico.prepare();terrain=pico.terrain;lift=null;return;
    }
    if(!level){terrain=[{x:0,y:floorY(),w:960,h:50}];return;}
    terrain=[...level.platforms];
    for(const gate of level.gates)if(gate.wall?!gateOpen(gate):gateOpen(gate))terrain.push(...gate.terrain);
    lift=level.lift?addMoving('auto',{...level.lift,y:liftY()}):null;
    for(const item of level.weightedLifts)addMoving(item.id,{...item,y:valueAt(replica.state.progress.lifts[item.id])});
    for(const box of level.boxes)addMoving(box.id,{...box,...valueAt(replica.state.progress.boxes[box.id])});
    const p=replica.state.progress,arrived=p.arrived.includes(member);
    if(wasArrived&&!arrived)Object.assign(player,level.spawn,{vx:0,vy:0,_hidden:false,state:'idle'});
    wasArrived=arrived;
    const present=replica.state.online||[];
    for(const name of Object.keys(peers))if(!present.includes(name))dropPeer(name);
    for(const name of present){
      if(name===member)continue;
      const anchor=replica.remoteMotion.sample(name);if(!anchor)continue;
      const peer=ensurePeer(name,anchor);Object.assign(peer,{x:anchor.x,y:anchor.y,vx:anchor.vx,facingRight:anchor.vx>=0});
      peer.state=p.arrived.includes(name)?'in-doorway':'idle';peer._hidden=p.arrived.includes(name);
      peer.frameIndex=Math.abs(anchor.vx)>1?2+Math.floor(replica.now()/130)%4:0;
    }
  }
  function pressure(id,active) {
    const held=(replica.state.progress.holds[id]||[]).includes(member),at=replica.now();
    if(!active&&!held)return;
    if(active && held && at-(holdSent.get(id)||0)<2000)return;
    if(replica.queue('hold',id,pose(),{active}).status==='queued')holdSent.set(id,at);
  }
  // Where a wrapped fall re-enters: the x of the last solid ground the cat stood on, if that
  // ground is still there; else the nearest point on any current terrain tile to that spot.
  function landingX() {
    const last=lastGround||level.spawn;
    if(terrain.some(t=>Math.abs(last.y+24-t.y)<0.1&&last.x+20>t.x&&last.x<t.x+t.w))return last.x;
    let best=last.x,bestD=Infinity;
    for(const t of terrain){
      const x=Math.min(Math.max(last.x,t.x),t.x+t.w-20),d=Math.hypot(x-last.x,t.y-24-last.y);
      if(d<bestD){bestD=d;best=x;}
    }
    return best;
  }
  function hazardRect(item) {
    const phase=((replica.clock()%item.cycleMs)+item.cycleMs)%item.cycleMs/item.cycleMs;
    const t=phase<0.5?phase*2:(1-phase)*2;
    return {...item,x:item.x+(item.toX-item.x)*t};
  }
  function interact(dt) {
    if(disposed)return;
    returnWalk=near(exitSpot())&&input.left?returnWalk+dt:0;
    if(returnWalk>=0.25){onExit();return;}
    if(!level)return;
    const p=replica.state.progress;
    if(pico&&level.physics==='pico'){if(p.arrived.includes(member))remember(level.index);pico.interact();return;}
    if(p.arrived.includes(member)){
      player._hidden=true;remember(level.index);
      if(connected())status.textContent=p.complete?'Together! Up returns to the calendar.':'Waiting for your friends. Up returns to the calendar.';
      return;
    }
    // PICO PARK fall: drop off the bottom and come back down from the top. Continuous, no shared
    // reset (only the moving pillar restarts the attempt). The cat ALWAYS re-enters above the
    // last solid ground it stood on (the lip it fell from), with its speed reset, and cannot
    // steer until it lands: same x + steering would let a fall bridge a crevasse, and gravity
    // would otherwise keep accumulating across wraps. Never the spawn point. If that ground has
    // moved away (a lift), the nearest solid ground to where the cat last stood is used instead.
    // Wrap before the top edge passes level.height so the relay never sees an out-of-range pose;
    // the ~250px jump exceeds RemoteMotion's teleport distance, so peers see a snap, not a sweep.
    const grounded=terrain.some(t=>Math.abs(player.y+24-t.y)<0.1&&player.x+20>t.x&&player.x<t.x+t.w);
    if(grounded&&!wrapDrop)lastGround={x:player.x,y:player.y};
    if(player.y>level.height){
      wrapDrop={x:landingX()};
      Object.assign(player,{x:wrapDrop.x,y:-28,vx:0,vy:0,standingOn:null});
    }
    if(wrapDrop){player.x=wrapDrop.x;player.vx=0;if(grounded)wrapDrop=null;}
    replica.motion(pose());
    const hit=level.hazards.some(item=>{const h=hazardRect(item);return player.x+20>h.x&&player.x<h.x+h.w&&player.y+24>h.y&&player.y<h.y+h.h;});
    if(!replica.state.running){
      retrying=false;
      // Exploring alone must not reset the shared attempt or queue puzzle actions.
      if(hit)Object.assign(player,level.spawn,{vx:0,vy:0,state:'idle',standingOn:null});
      if(connected())status.textContent='Explore while waiting for a friend. Two players are needed to solve this puzzle.';
      return;
    }
    if(hit){
      if(!retrying)retrying=replica.queue('retry','hazard',{...level.spawn,vx:0,vy:0}).status==='queued';
      if(connected())status.textContent='Try again together...';return;
    }
    const riding=[...moving.values()].some(tile=>Math.abs(player.y+24-tile.y)<0.1&&player.x+20>tile.x&&player.x<tile.x+tile.w);
    if(!riding&&!player._carriedThisTick&&player.vx===0&&player.vy===0){
      const rest=player.x.toFixed(1)+','+player.y.toFixed(1);
      if(rest!==lastRest&&replica.queue('settle','rest',pose()).status==='queued')lastRest=rest;
    }else lastRest=null;
    for(const pad of level.switches)pressure(pad.id,onPad(pad));
    for(const item of level.weightedLifts){const tile=moving.get(item.id);pressure(item.id,Math.abs(player.y+24-tile.y)<3&&player.vy>=0&&player.x+20>tile.x&&player.x<tile.x+tile.w);}
    const direction=input.right?1:input.left?-1:0;
    const candidate=direction && level.boxes.find(box=>{
      const tile=moving.get(box.id),side=direction===1?Math.abs(player.x+20-tile.x):Math.abs(player.x-tile.x-tile.w);
      return side<10 && player.y+24>=tile.y-2 && player.y<tile.y+tile.h;
    });
    if(pushing && (!candidate || candidate.id!==pushing.id || direction!==pushing.direction)){
      if(replica.queue('push',pushing.id,pose(),{direction:0}).status==='queued')pushing=null;
    } else if(candidate && replica.now()>=pushAt){
      const state=p.boxes[candidate.id],tile=moving.get(candidate.id);
      const hasNext=candidate.nodes.some(node=>direction===1?node.x>tile.x+0.1:node.x<tile.x-0.1);
      if(hasNext && replica.queue('push',candidate.id,pose(),{direction}).status==='queued'){
        pushing={id:candidate.id,direction};pushAt=replica.now()+(replica.clock()<state.at+state.duration?2000:500);
      }
    }
    if(near(level.key)&&!p.keyHolder&&!p.doorOpen)replica.queue('key','key',pose());
    if(near(level.goal)&&p.keyHolder===member&&!p.doorOpen)replica.queue('unlock','door',pose());
    if(connected()){
      const text=replica.outbox.length?'Saving your progress...':near(level.goal)?p.doorOpen?'Up to enter. Everyone must reach the exit.':'Bring the key to this door.':level.hint;
      if(status.textContent!==text)status.textContent=text;
    }
  }
  function door(ctx,center,floor,open) {
    ctx.fillStyle='#57756c';ctx.beginPath();ctx.roundRect(center-22,floor-53,44,53,[21,21,0,0]);ctx.fill();
    ctx.fillStyle=open?'#030606':'#57756c';ctx.beginPath();ctx.roundRect(center-19,floor-50,38,50,[18,18,0,0]);ctx.fill();
    if(!open){ctx.fillStyle='#e2b640';ctx.fillRect(center+8,floor-25,3,3);}
  }
  function scenery(ctx) {
    if(pico&&level?.physics==='pico'){pico.scenery(ctx);return;}
    api._translateForCamera(ctx);ctx.fillStyle='#57756c';
    for(const tile of terrain)ctx.fillRect(tile.x,tile.y,tile.w,tile.h);
    const exit=exitSpot();
    door(ctx,exit.x,exit.y+CAT_H,true);ctx.fillStyle='#57756c';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('Calendar',exit.x,exit.y+CAT_H-64);
    if(level){
      const p=replica.state.progress;
      door(ctx,level.goal.x+10,level.goal.y+24,p.doorOpen);
      for(const sw of level.switches){ctx.fillStyle=(p.holds[sw.id]||[]).length?'#e2b640':'#bc5151';ctx.fillRect(sw.x,sw.y+19,22,5);}
      for(const box of level.boxes){
        const tile=moving.get(box.id),dock=box.nodes.at(-1);
        ctx.strokeStyle='#d7e3db';ctx.lineWidth=2;ctx.strokeRect(tile.x+3,tile.y+3,tile.w-6,tile.h-6);
        ctx.fillStyle='#e2b640';ctx.fillText('\u2194',tile.x+tile.w/2,tile.y+tile.h/2+4);
        if(level.gates.some(g=>g.boxes?.includes(box.id))){ctx.fillStyle=p.gates.some(id=>level.gates.find(g=>g.id===id)?.boxes?.includes(box.id))?'#e2b640':'#bc5151';ctx.fillRect(dock.x,dock.y+box.h-4,box.w,4);}
      }
      for(const item of level.weightedLifts){const tile=moving.get(item.id),half=Math.max(1,Math.min(4,Math.ceil((replica.state.online||[]).length/2))),min=item.minRiders==='half'?half:item.minRiders,max=item.maxRiders==='half'?half:item.maxRiders;
        ctx.fillStyle='#57756c';ctx.fillText((p.holds[item.id]||[]).length+' / '+(max?min+'-'+max:min)+' riders',tile.x+tile.w/2,tile.y+24);
      }
      for(const item of level.hazards){const h=hazardRect(item);ctx.fillStyle='#bc5151';ctx.fillRect(h.x,h.y,h.w,h.h);}
      if(!p.doorOpen){const holder=p.keyHolder===member?player:peers[p.keyHolder],point=holder?{x:holder.x,y:holder.y-16}:!p.keyHolder?level.key:null;if(point&&keyImage.complete&&keyImage.naturalWidth)ctx.drawImage(keyImage,point.x,point.y,18,18);}
    }
    api._restoreFromCamera(ctx);
  }
  function playerStep(dt) {
    if(disposed)return;
    if(replica.state?.progress.arrived.includes(member)){if(input.up&&!player._upHandled)onExit();player._upHandled=!!input.up;}
    else if(retrying){player.vx=0;player.vy=0;if(input.up&&!player._upHandled)onExit();player._upHandled=!!input.up;}
    else {
      // A sparse remote jump can briefly overlap an idle player's feet.
      // Do not let interpolation push a button holder off their button.
      // Real block/lift carrying has already run in prepare().
      const planted=!input.left&&!input.right&&!input.jump&&player.vy===0&&!player.standingOn;
      const x=player.x;player.update(dt);if(planted)player.x=x;
      if(pico&&level?.physics==='pico')pico.afterUpdate();
    }
  }
  // Fixed 60 Hz simulation: prepare -> player -> interact -> camera, up to
  // MAX_STEPS per rendered frame, so jump height and the camera lerp no
  // longer depend on the display's refresh rate.
  const clock=createFixedStep();
  function tick(dt) {
    clock.advance(dt,()=>{
      if(disposed)return false;
      prepare();playerStep(clock.step);interact(clock.step);
      if(disposed)return false;
      api._updateCamera();
    });
  }
  entities.set('step',{update:tick});entities.set('scenery',{zIndex:1,render:scenery});
  entities.set('player',{zIndex:10,render:ctx=>pico&&level?.physics==='pico'?pico.drawCat(ctx,player,member):player.render(ctx)});
  engine.sceneEntities=entities;
  return {getWorld:()=>({player,level,terrain,lift:pico&&level?.physics==='pico'?pico.lift:lift,peers,moving,pico}),dispose(){if(disposed)return;disposed=true;pico?.dispose();board.setBoardHeight?.();if(engine.sceneEntities===entities)engine.sceneEntities=null;Object.assign(api._camera,oldCamera);for(const key of Object.keys(input))input[key]=false;}};
}
