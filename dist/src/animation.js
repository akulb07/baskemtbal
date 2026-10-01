import * as T from '../vendor/three.module.js';
import { clamp } from './config.js';
const down = new T.Vector3(0,-1,0);
const target = new T.Vector3(), dir = new T.Vector3(), bend = new T.Vector3(), elbow = new T.Vector3();
const lower = new T.Vector3(), parentQ = new T.Quaternion(), lowerQ = new T.Quaternion();
const poseTarget = new T.Quaternion();

// Two-bone reach keeps the palm on the simulated basketball during gathers.
function reach(c, index, ball) {
  target.set(ball.x,ball.y,ball.z);
  const arm = c.arms[index], fore = c.forearms[index];
  arm.parent.worldToLocal(target);
  dir.copy(target).sub(arm.position);
  const d = clamp(dir.length(), .08, .625);
  dir.normalize();
  bend.set(index ? .5 : -.5, -.8, -.3).addScaledVector(dir, -bend.dot(dir)).normalize();
  elbow.copy(arm.position).addScaledVector(dir,d/2).addScaledVector(bend,Math.sqrt(Math.max(0,.32*.32-d*d/4)));
  lower.copy(elbow).sub(arm.position).normalize();
  arm.quaternion.setFromUnitVectors(down,lower);
  lower.copy(arm.position).addScaledVector(dir,d).sub(elbow).normalize();
  lowerQ.setFromUnitVectors(down,lower);
  parentQ.copy(arm.quaternion).invert();
  fore.quaternion.copy(parentQ.multiply(lowerQ));
}

export function animatePlayer(c, p, ball, dt) {
  const joints = c.poseJoints ||= [c.body,...(c.upperBody ? [c.upperBody] : []),...c.legs,...c.knees,...c.feet,...c.arms,...c.forearms,...c.hands];
  const previous = c.posePrevious ||= joints.map(j => j.quaternion.clone());
  joints.forEach((j,i) => previous[i].copy(j.quaternion));
  const oldHeight = c.body.position.y;
  const speed = Math.hypot(p.vx,p.vz), owns = ball.owner === p.id;
  const gatherT = p.gather ? clamp(p.gather.time/p.gather.duration,0,1) : 0;
  const cycle = p.gather ? gatherT*Math.PI*2/.6 : (p.gait || 0)*Math.PI*2;
  const stride = Math.sin(cycle)*Math.min(.75,speed*.19);
  const air = p.y > .08;
  const landing = Math.sin(clamp((p.landing || 0)/.22,0,1)*Math.PI)*.12;
  c.body.position.y = air ? 0 : -.07-Math.min(.05,speed*.008) + Math.abs(stride)*.025-landing;
  c.body.rotation.set(p.post ? -.12 : p.defending ? .17 : speed*.018,0,0);
  const lateral = Math.cos(p.angle)*p.vx-Math.sin(p.angle)*p.vz;
  c.body.rotation.z = -lateral*.025;
  if (c.upperBody) {
    c.upperBody.rotation.set(p.charging ? -.06 : speed*.012,
      Math.sin(cycle)*Math.min(.12,speed*.035),-c.body.rotation.z*.5);
    c.upperBody.position.y = 1.05+Math.sin(p.phase*2)*.004;
  }
  for (let i=0;i<2;i++) {
    const sign = i ? -1 : 1;
    c.legs[i].rotation.set(air ? (i === (p.hand===1?0:1) ? -.6 : .3) : stride*sign,0,p.defending ? sign*.15 : 0);
    c.knees[i].rotation.x = air ? .65 : .12 + Math.max(0,-stride*sign)*.85;
    c.feet[i].rotation.x = -c.knees[i].rotation.x*.4;
    c.arms[i].rotation.set(-stride*sign*.45,0,sign*.12);
    c.forearms[i].rotation.set(-.35,0,0);
    c.hands[i].rotation.x = 0;
  }
  const hand = p.hand === 1 ? 1 : 0;
  if (p.defending || p.screen) {
    c.body.position.y -= .08;
    c.arms[0].rotation.z = p.screen ? .2 : 1;
    c.arms[1].rotation.z = p.screen ? -.2 : -1;
    c.knees.forEach(k => k.rotation.x = .35);
  }
  if (p.post) {
    c.body.position.y -= .07;
    c.arms[1-hand].rotation.x = -.9;
    c.arms[1-hand].rotation.z = (hand ? 1 : -1)*.6;
    c.knees.forEach(k => k.rotation.x = .35);
  }
  if (p.moveTime > 0) {
    const t = clamp(1-p.moveTime/(p.moveDuration || .7),0,1);
    const sway = Math.sin(t*Math.PI*2)*.25;
    c.body.rotation.z = sway*p.hand;
    if (p.moveKind === 'spin' || p.moveKind === 'drop') c.body.rotation.y = t*Math.PI*2;
    if (p.moveKind === 'jab') { c.legs[hand].rotation.x = -Math.sin(t*Math.PI)*.55; c.legs[1-hand].rotation.x = 0; }
    if (p.moveKind === 'euro') c.body.rotation.z = Math.sin(t*Math.PI*2)*.3;
    if (p.moveKind === 'pinoy' && c.upperBody) c.upperBody.rotation.y += Math.sin(t*Math.PI)*.8*p.hand;
    if (p.moveKind === 'euro' && c.upperBody) c.upperBody.rotation.y += Math.sin(t*Math.PI*2)*.35;
  }
  const style = p.charging ? p.shotPlan || '' : p.shotStyle || '';
  if (p.charging) {
    c.body.position.y -= Math.sin(clamp(p.charge/.53,0,1)*Math.PI)*.12;
    c.knees.forEach(k => k.rotation.x += .25);
  }
  if (!air) {
    // Solve hip/knee to a ground-height ankle through the stance half of each stride.
    const forward = Math.sin(p.angle)*p.vx+Math.cos(p.angle)*p.vz;
    const lateral = Math.cos(p.angle)*p.vx-Math.sin(p.angle)*p.vz;
    for (let i=0;i<2;i++) {
      const phase = cycle+i*Math.PI;
      const swing = Math.max(0,Math.sin(phase));
      const reachZ = Math.cos(phase)*Math.min(.27,Math.abs(forward)*.065)*Math.sign(forward);
      const lift = swing*Math.min(.13,speed*.03);
      const vertical = .8+c.body.position.y-.065-lift;
      const d = clamp(Math.hypot(vertical,reachZ),.15,.729);
      c.legs[i].rotation.x = -Math.atan2(reachZ,vertical)-Math.acos(clamp((.38*.38+d*d-.35*.35)/(2*.38*d),-1,1));
      c.knees[i].rotation.x = Math.PI-Math.acos(clamp((.38*.38+.35*.35-d*d)/(2*.38*.35),-1,1));
      c.feet[i].rotation.x = -c.legs[i].rotation.x-c.knees[i].rotation.x;
      if (p.defending) c.legs[i].rotation.z += Math.cos(phase)*lateral*.04;
    }
  }
  if (p.animation > 0 && !owns) {
    if (p.state === 'BLOCKING') {
      c.arms[hand].rotation.x = -Math.PI;
      c.arms[1-hand].rotation.x = -2.1;
    } else if (p.state === 'STEALING' || p.state === 'PASSING') {
      c.arms.forEach(a => a.rotation.x = -1.4);
      c.forearms.forEach(a => a.rotation.x = -.12);
    } else if (/SHOOTING|DUNK|LAYUP/.test(p.state)) {
      const release = clamp(1-p.animation/.65,0,1);
      const hold = 1-clamp((release-.25)/.75,0,1)**2;
      const armAngle = /SCOOP|JELLY/.test(style) ? -1.6-release : -2.9;
      c.arms[hand].rotation.x += (armAngle-c.arms[hand].rotation.x)*hold;
      c.arms[1-hand].rotation.x += ((style.includes('TWO HAND') ? -2.9 : -1.3)-c.arms[1-hand].rotation.x)*hold;
      c.forearms[hand].rotation.x = -.12;
      c.hands[hand].rotation.x = .9*hold;
      if (style === 'HOOK') c.arms[hand].rotation.z = p.hand*.6;
      if (style === 'FADEAWAY') c.body.rotation.x = -.3;
    }
  }
  if (owns) {
    if (style.includes('TOMAHAWK')) c.body.rotation.x = -.15;
  }
  const blend = 1-Math.exp(-Math.min(dt,.05)*18);
  c.body.position.y = oldHeight+(c.body.position.y-oldHeight)*blend;
  joints.forEach((joint,i) => {
    poseTarget.copy(joint.quaternion);
    joint.quaternion.copy(previous[i]).slerp(poseTarget,blend);
  });
  if (owns) {
    c.root.updateMatrixWorld(true);
    reach(c,hand,ball);
    if ((p.charging && (!/HOOK|SCOOP|JELLY|DUNK/.test(style) || style.includes('TWO HAND'))) || p.gather) reach(c,1-hand,ball);
  }
}
