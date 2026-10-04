import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import { animatePlayer } from '../dist/src/animation.js';
import { MOVES } from '../dist/src/moves.js';

function rig() {
  const c={root:new T.Group(),body:new T.Group(),legs:[],knees:[],feet:[],arms:[],forearms:[],hands:[]};
  c.root.add(c.body);
  for(const side of [-1,1]) {
    const leg=new T.Group(),knee=new T.Group(),foot=new T.Group();
    leg.position.set(side*.125,.8,0); knee.position.y=-.38; foot.position.set(0,-.35,.055);
    c.body.add(leg); leg.add(knee); knee.add(foot);
    c.legs.push(leg); c.knees.push(knee); c.feet.push(foot);
    const arm=new T.Group(),fore=new T.Group(),hand=new T.Group();
    c.body.add(arm); arm.add(fore); fore.add(hand);
    c.arms.push(arm); c.forearms.push(fore); c.hands.push(hand);
  }
  return c;
}
const player=()=>({id:0,x:0,y:0,z:0,vx:0,vz:0,angle:0,gait:0,phase:0,hand:1});
function frame(c,p) {
  c.root.position.set(p.x,p.y,p.z);
  animatePlayer(c,p,{owner:null},1/60);
  c.root.updateMatrixWorld(true);
}
test('grounded feet keep their height and stance position as the hips move',()=>{
  const c=rig(),p=player();
  for(let i=0;i<60;i++) frame(c,p);
  const before=c.feet[0].getWorldPosition(new T.Vector3());
  p.vz=1;
  for(let i=0;i<6;i++) {p.z+=1/60; p.gait+=1/60/1.65; frame(c,p);}
  const after=c.feet[0].getWorldPosition(new T.Vector3());
  assert.ok(after.distanceTo(before)<.002,'stance foot slid with the body');
  assert.ok(Math.abs(after.y-.065)<.002,'shoe left the ground');
});
test('jump, landing, gather and possession resets keep joint poses finite',()=>{
  const c=rig(),p=player();
  for(let i=0;i<180;i++) {
    p.y=i>30&&i<90 ? Math.sin((i-30)/60*Math.PI) : 0;
    p.vx=3; p.x+=.05; p.gait+=.05/1.65;
    p.gather=i>100&&i<130 ? {time:(i-100)/60,duration:.62}:null;
    if(i===145) p.x=-5;
    frame(c,p);
    c.root.traverse(j=>assert.ok([...j.quaternion.toArray(),...j.position.toArray()].every(Number.isFinite)));
  }
});

test('euro alternates feet, hop gathers both feet and drop step holds its pivot',()=>{
  for(const move of ['euro','pinoy','hop','drop']) {
    const c=rig(),p=player(),spec=MOVES[move];
    for(let i=0;i<60;i++) frame(c,p);
    const pivot=c.feet[0].getWorldPosition(new T.Vector3());
    p.gather={move,side:1,time:0,duration:spec.duration};
    for(let i=0;i<=12;i++) {
      p.gather.time=spec.duration*spec.takeoff*.3*i/12;
      frame(c,p);
    }
    const left=c.feet[0].getWorldPosition(new T.Vector3());
    const right=c.feet[1].getWorldPosition(new T.Vector3());
    assert.ok(right.y>.085,`${move} lead foot should clear the ground`);
    if(move==='hop') assert.ok(left.y>.085,'hop gathers both feet');
    else assert.ok(left.distanceTo(pivot)<.003,`${move} support foot should remain planted`);
    if(move==='euro' || move==='pinoy') {
      for(let i=1;i<=20;i++) {
        p.gather.time=spec.duration*spec.takeoff*(.3+.48*i/20);
        frame(c,p);
      }
      assert.ok(c.feet[0].getWorldPosition(new T.Vector3()).y>.085,`${move} transfers to the second step`);
      assert.ok(Math.abs(c.feet[1].getWorldPosition(new T.Vector3()).y-.065)<.003);
    }
  }
});
