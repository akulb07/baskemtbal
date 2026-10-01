import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSimulation } from '../dist/src/simulation.js';
import { AIInputController } from '../dist/src/ai.js';
import { C, States, emptyInput } from '../dist/src/config.js';
import { validateInput } from '../server/rooms.js';
const live = (mode='ai') => { const g=new GameSimulation(mode); g.state=States.LIVE; return g; };
const step = (g, seconds, inputs=[]) => { for(let t=0;t<seconds;t+=C.dt) g.step(C.dt,inputs); };

test('descending goaltend awards the shot once, without block or brick', () => {
  const g=live();
  Object.assign(g.ball,{owner:null,x:0,y:3.65,z:C.hoop.z+.55,vy:-2,vx:0,vz:-2,age:.3,shooter:0,lastTouch:0,points:2,shotPending:true});
  Object.assign(g.players[1],{x:0,z:C.hoop.z+.55,y:1.5,blockCd:.5});
  g.ballPhysics(C.dt);
  assert.deepEqual(g.score,[2,0]);
  assert.equal(g.stats[1].blocks,0);
  assert.equal(g.stats[0].made,1);
  assert.ok(g.events.some(e=>e.text==='GOALTENDING'));
  step(g,.5);
  assert.deepEqual(g.score,[2,0]);
  assert.ok(!g.events.some(e=>e.type==='miss'));
});

test('rising shots outside the cylinder remain legally blockable', () => {
  const g=live();
  Object.assign(g.ball,{owner:null,x:1,y:3.4,z:3,vy:2,vx:0,vz:-1,age:.3,shooter:0,lastTouch:0,shotPending:true});
  Object.assign(g.players[1],{x:1,z:3,y:1.4,blockCd:.5});
  g.ballPhysics(C.dt);
  assert.equal(g.stats[1].blocks,1);
  assert.deepEqual(g.score,[0,0]);
});

test('team scoring and winning belong to the team of any shooter', () => {
  const g=live('team'); g.score=[10,8];
  Object.assign(g.ball,{owner:null,shooter:4,points:1,shotPending:true});
  g.awardBasket();
  assert.deepEqual(g.score,[11,8]); assert.equal(g.winner,0);
  assert.equal(g.stats[4].made,1); assert.equal(g.stats[0].made,0);
});

test('passes can be caught or intercepted without recording shots or rebounds', () => {
  for(const interceptor of [false,true]) {
    const g=live('team');
    g.players.forEach((p,i)=>{p.x=6;p.z=12-i*.8;});
    Object.assign(g.players[0],{x:-3,z:7});
    Object.assign(g.players[2],{x:3,z:7});
    if(interceptor) Object.assign(g.players[1],{x:0,z:7});
    g.pass(g.players[0],{x:1,z:0});
    for(let t=0;t<1 && g.ball.owner===null;t+=C.dt) g.ballPhysics(C.dt);
    assert.equal(g.ball.owner,interceptor?1:2);
    assert.equal(g.stats.reduce((n,s)=>n+s.rebounds+s.attempts,0),0);
    assert.equal(g.needsClear,interceptor);
    assert.equal(g.stats[1].steals,interceptor?1:0);
  }
});

test('teammates do not contest shots; all defenders do', () => {
  const g=live('team');
  g.players.forEach(p=>{p.x=6;p.z=12;});
  Object.assign(g.players[0],{x:0,z:5});
  Object.assign(g.players[2],{x:0,z:4.6,defending:true});
  assert.equal(g.contest(0),0);
  Object.assign(g.players[5],{x:0,z:4.6,defending:true});
  assert.ok(g.contest(0)>.5);
});

test('AI 3v3 completes a match with valid team scores and finite player positions', () => {
  const g=new GameSimulation('team',{winScore:5});
  const ai=g.players.map(p=>new AIInputController(p.id));
  for(let t=0;t<600 && g.state!==States.OVER;t+=C.dt) g.step(C.dt,ai.map(a=>a.sample(g)));
  assert.equal(g.state,States.OVER,JSON.stringify({score:g.score,clock:g.clock,owner:g.ball.owner}));
  assert.equal(g.score.length,2);
  assert.ok(g.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});

test('gathers keep their selected finish through snapshot restore and release', () => {
  for(const move of ['euro','pinoy','hop','drop']) {
    const g=live('practice'); Object.assign(g.players[0],{x:0,z:4});
    g.step(C.dt,[{...emptyInput(),move}]);
    assert.ok(g.players[0].gather);
    const copy=live('practice'); copy.restore(g.snapshot());
    step(copy,.25);
    copy.players[0].charge=.53; copy.players[0].charging=true;
    copy.release(copy.players[0],emptyInput());
    assert.match(copy.ball.shotType,/LAYUP/);
    assert.ok(Number.isFinite(copy.ball.vy));
    assert.equal(copy.players[0].gather,null);
  }
});

test('server accepts move intent but strips forged results', () => {
  const input=validateInput({...emptyInput(),move:'euro',post:true,finish:'hook',score:[11,0]});
  assert.equal(input.move,'euro'); assert.equal(input.finish,'hook');
  assert.equal(input.score,undefined);
  assert.equal(validateInput({...emptyInput(),finish:'teleport'}).finish,'auto');
});

test('airborne bodies collide with either face of the backboard; grounded baseline movement remains legal', () => {
  const g=live(); const p=g.players[0];
  for (const side of [-1,1]) {
    Object.assign(p,{x:0,y:1.2,z:C.board.z-side*.1,vz:-side*4});
    g.resolveBackboard(p,C.board.z+side*.5);
    assert.ok((p.z-C.board.z)*side >= C.playerRadius);
    assert.equal(p.vz,0);
  }
  Object.assign(p,{x:0,y:0,z:.6,vz:-2});
  g.resolveBackboard(p,1.5);
  assert.equal(p.z,.6);
});

test('protected catches and offensive interference cannot steal a basket', () => {
  for (const id of [1,2]) {
    const g=live('team');
    Object.assign(g.ball,{owner:null,x:0,z:C.hoop.z,y:3.4,vy:-1,vx:0,vz:0,age:.6,shotPending:true,shooter:0,points:2});
    g.players.forEach(p=>{p.x=6;p.z=8;});
    Object.assign(g.players[id],{x:0,z:C.hoop.z,y:1.9,blockCd:0});
    g.ballPhysics(C.dt);
    assert.equal(g.ball.owner,null);
    assert.deepEqual(g.score,id===1?[2,0]:[0,0]);
    assert.equal(g.state,id===1?States.SCORE:States.DEAD);
  }
});

test('normal jump shots leave the floor before release and use takeoff position for scoring', () => {
  const g=live('practice'); const p=g.players[0];
  Object.assign(p,{x:0,z:8.5});
  step(g,.5,[{...emptyInput(),shoot:true}]);
  assert.ok(p.y>.3); assert.ok(p.shotOrigin);
  p.z=6; p.charge=.68;
  g.release(p,emptyInput());
  assert.equal(g.ball.points,2);
  assert.ok(g.ball.y>2);
});

test('every gather flows into an airborne finish without a second charge or stationary wait', () => {
  for (const move of ['euro','pinoy','hop','drop']) {
    const g=live('practice'), p=g.players[0];
    Object.assign(p,{x:0,z:4,angle:Math.PI});
    g.step(C.dt,[{...emptyInput(),move}]);
    let releasedAt=0;
    for (let t=C.dt;t<.75;t+=C.dt) {
      g.step(C.dt,[emptyInput()]);
      if (p.gather && p.tookOff) assert.ok(Math.hypot(p.vx,p.vz)>.5,`${move} stalled`);
      if (g.stats[0].attempts) { releasedAt=t; break; }
    }
    assert.ok(releasedAt>0 && releasedAt<.7,`${move} waited after footwork`);
    assert.ok(p.y>.3,`${move} released from the floor`);
    assert.equal(g.stats[0].attempts,1);
    assert.match(g.ball.shotType,/LAYUP/);
  }
});

test('fadeaway takes off early and rewards the quick release rather than ordinary jumper timing', () => {
  for (const duration of [.46,.68]) {
    const g=live('practice'), p=g.players[0];
    Object.assign(p,{x:0,z:5});
    step(g,.23,[{...emptyInput(),shoot:true,post:true,finish:'fade'}]);
    assert.ok(p.y>0,'fade takeoff still uses slow jumper timing');
    step(g,duration-.23,[{...emptyInput(),shoot:true,post:true,finish:'fade'}]);
    g.step(C.dt,[{...emptyInput(),finish:'fade'}]);
    assert.equal(g.lastShot.type,'FADEAWAY');
    assert.equal(g.lastShot.perfect,duration===.46);
    assert.ok(g.ball.y>2,'release must be airborne');
  }
});
