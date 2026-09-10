// All six puzzles share the calendar canvas, sprites, input and physics.
export function mountBoardScene({ board, replica, member, onExit, onLobby, onSelect, lobby = false, completed = [], remember = () => {}, status, connected }) {
  const { engine, input, api } = board;
  const titles = ['Hello together','Switchback','Lift relay','Moving walls','Upstairs / downstairs','Weight together'];
  const doors = [0,3,4,5,1,2].map((index,i)=>({index,x:220+i*190,y:146,title:titles[index],reference:index===0?'World 1-1':index>=3?'World 1-'+(index-1):'Cooperative challenge'}));
  const lobbyDoor = {x:145,y:146}, entities = new Map(), peers = {};
  const oldCamera = {...api._camera}, holdSent = new Map(), moving = new Map();
  let level=null, terrain=[], lift=null, disposed=false, lastLevel=null, returnWalk=0, lastRest=null, retrying=false, wasArrived=false;
  let pushAt=0, pushing=null;
  const keyImage = new Image();keyImage.src='key.png';
  const pose = ()=>({x:player.x,y:player.y,vx:player.vx,vy:player.vy});
  const near = item=>item && Math.hypot(player.x-item.x,player.y-item.y)<22;
  const onPad = item=>Math.abs(player.x-item.x)<20 && Math.abs(player.y-item.y)<3 && player.vy>=0;
  const player = board.createPlayer({x:90,y:146,input,terrain:()=>terrain,peers:()=>peers,canvasW:()=>level?.width || (lobby?1360:960),onUpPressed:act});
  player.engine=engine;
  Object.assign(api._camera,{x:0,enabled:true,followFn:()=>player,levelWFn:()=>Math.max(level?.width || (lobby?1360:960),board.viewportW()),vwFn:board.viewportW,cameraStateFn:()=>null});
  function act() {
    if(disposed)return;
    if(near(level?.exit || {x:43,y:146})){onExit();return;}
    if(lobby){const door=doors.find(near);if(door)onSelect(door.index);return;}
    if(level && near(lobbyDoor)){onLobby();return;}
    if(!level || !near(level.goal) || !replica.state.running)return;
    const p=replica.state.progress;
    if(p.arrived.includes(member)){onLobby();return;}
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
  function prepare() {
    if(disposed)return;
    const identity=replica.state && replica.state.epoch+'/'+replica.state.level.id;
    if(identity && identity!==lastLevel){
      level=replica.state.level;lastLevel=identity;lastRest=null;retrying=false;wasArrived=false;moving.clear();holdSent.clear();pushing=null;pushAt=0;
      for(const name of Object.keys(peers)){entities.delete('peer:'+name);delete peers[name];}
      const saved=replica.state.poses[member];
      Object.assign(player,saved && saved.y<level.height?saved:level.spawn,{vx:0,vy:0,state:'idle',standingOn:null,_hidden:false});
      if(replica.state.progress.arrived.includes(member))Object.assign(player,level.goal);
      if(!saved)player.x+=28*(replica.state.members.indexOf(member)%5);
    }
    if(!level){terrain=[{x:0,y:170,w:lobby?1360:960,h:50}];api._updateCamera();return;}
    terrain=[...level.platforms];
    for(const gate of level.gates)if(gate.wall?!gateOpen(gate):gateOpen(gate))terrain.push(...gate.terrain);
    lift=level.lift?addMoving('auto',{...level.lift,y:liftY()}):null;
    for(const item of level.weightedLifts)addMoving(item.id,{...item,y:valueAt(replica.state.progress.lifts[item.id])});
    for(const box of level.boxes)addMoving(box.id,{...box,...valueAt(replica.state.progress.boxes[box.id])});
    const p=replica.state.progress,arrived=p.arrived.includes(member);
    if(wasArrived&&!arrived)Object.assign(player,level.spawn,{vx:0,vy:0,_hidden:false,state:'idle'});
    wasArrived=arrived;
    const present=replica.state.online||[];
    for(const name of Object.keys(peers))if(!present.includes(name)){entities.delete('peer:'+name);delete peers[name];}
    for(const name of present){
      if(name===member)continue;
      const anchor=replica.remoteMotion.sample(name);if(!anchor)continue;
      if(!peers[name]){const peer=board.createPeer(name,anchor);peer.engine=engine;peers[name]=peer;entities.set('peer:'+name,{zIndex:10,render:ctx=>peer.render(ctx),getLabelSpec:()=>peer.getLabelSpec()});}
      const peer=peers[name];Object.assign(peer,{x:anchor.x,y:anchor.y,vx:anchor.vx,facingRight:anchor.vx>=0});
      peer.state=p.arrived.includes(name)?'in-doorway':'idle';peer._hidden=p.arrived.includes(name);
      peer.frameIndex=Math.abs(anchor.vx)>1?2+Math.floor(replica.now()/130)%4:0;
    }
    api._updateCamera();
  }
  function pressure(id,active) {
    const held=(replica.state.progress.holds[id]||[]).includes(member),at=replica.now();
    if(!active&&!held)return;
    if(active && held && at-(holdSent.get(id)||0)<2000)return;
    if(replica.queue('hold',id,pose(),{active}).status==='queued')holdSent.set(id,at);
  }
  function hazardRect(item) {
    const phase=((replica.clock()%item.cycleMs)+item.cycleMs)%item.cycleMs/item.cycleMs;
    const t=phase<0.5?phase*2:(1-phase)*2;
    return {...item,x:item.x+(item.toX-item.x)*t};
  }
  function interact(dt) {
    if(disposed)return;
    returnWalk=near(level?.exit||{x:43,y:146})&&input.left?returnWalk+dt:0;
    if(returnWalk>=0.25){onExit();return;}
    if(!level)return;
    const p=replica.state.progress;
    if(p.arrived.includes(member)){
      player._hidden=true;remember(level.index);
      if(connected())status.textContent=p.complete?'Together! Up to choose a puzzle or replay.':'Waiting for your friends. Up returns to the puzzle doors.';
      return;
    }
    replica.motion(pose());
    const hit=level.hazards.some(item=>{const h=hazardRect(item);return player.x+20>h.x&&player.x<h.x+h.w&&player.y+24>h.y&&player.y<h.y+h.h;});
    if(!replica.state.running){
      retrying=false;
      // Exploring alone must not reset the shared attempt or queue puzzle actions.
      if(player.y>level.height+20 || hit){
        Object.assign(player,level.spawn,{vx:0,vy:0,state:'idle',standingOn:null});
      }
      if(connected())status.textContent='Explore while waiting for a friend. Two players are needed to solve this puzzle.';
      return;
    }
    if(player.y>level.height+20 || hit){
      if(!retrying)retrying=replica.queue('retry','fall',{...level.spawn,vx:0,vy:0}).status==='queued';
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
      const text=replica.outbox.length?'Saving your progress...':near(lobbyDoor)?'Up to choose a puzzle.':near(level.goal)?p.doorOpen?'Up to enter. Everyone must reach the exit.':'Bring the key to this door.':level.hint;
      if(status.textContent!==text)status.textContent=text;
    }
  }
  function door(ctx,center,floor,open) {
    ctx.fillStyle='#57756c';ctx.beginPath();ctx.roundRect(center-22,floor-53,44,53,[21,21,0,0]);ctx.fill();
    ctx.fillStyle=open?'#030606':'#57756c';ctx.beginPath();ctx.roundRect(center-19,floor-50,38,50,[18,18,0,0]);ctx.fill();
    if(!open){ctx.fillStyle='#e2b640';ctx.fillRect(center+8,floor-25,3,3);}
  }
  function scenery(ctx) {
    api._translateForCamera(ctx);ctx.fillStyle='#57756c';
    for(const tile of terrain)ctx.fillRect(tile.x,tile.y,tile.w,tile.h);
    door(ctx,43,170,true);ctx.fillStyle='#57756c';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('Calendar',43,106);
    if(lobby){
      for(const item of doors){door(ctx,item.x+10,170,true);ctx.fillStyle='#57756c';ctx.fillText((completed.includes(item.index)?'\u2713 ':'')+item.title,item.x+10,104);ctx.fillText(item.reference,item.x+10,84);if(near(item))ctx.fillText('Up to enter',item.x+10,65);}
    }
    if(level){
      const p=replica.state.progress;
      door(ctx,level.goal.x+10,level.goal.y+24,p.doorOpen);door(ctx,lobbyDoor.x+10,170,true);
      ctx.fillStyle='#57756c';ctx.fillText('Levels',lobbyDoor.x+10,106);
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
  entities.set('prepare',{update:prepare});entities.set('scenery',{zIndex:1,render:scenery});
  entities.set('player',{zIndex:10,update(dt){
    if(replica.state?.progress.arrived.includes(member)){if(input.up&&!player._upHandled)onLobby();player._upHandled=!!input.up;}
    else if(retrying){player.vx=0;player.vy=0;if(input.up&&!player._upHandled)onLobby();player._upHandled=!!input.up;}
    else {
      // A sparse remote jump can briefly overlap an idle player's feet.
      // Do not let interpolation push a button holder off their button.
      // Real block/lift carrying has already run in prepare().
      const planted=!input.left&&!input.right&&!input.jump&&player.vy===0&&!player.standingOn;
      const x=player.x;player.update(dt);if(planted)player.x=x;
    }
  },render:ctx=>player.render(ctx)});
  entities.set('interact',{update:interact});engine.sceneEntities=entities;
  return {getWorld:()=>({player,level,terrain,lift,peers,lobby,doors,moving}),dispose(){if(disposed)return;disposed=true;if(engine.sceneEntities===entities)engine.sceneEntities=null;Object.assign(api._camera,oldCamera);for(const key of Object.keys(input))input[key]=false;}};
}
