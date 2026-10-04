import * as T from '../vendor/three.module.js';
import { clamp } from './config.js';
import { MOVES, shotTiming } from './moves.js';
const down = new T.Vector3(0,-1,0);
const target = new T.Vector3(), dir = new T.Vector3(), bend = new T.Vector3(), elbow = new T.Vector3();
const lower = new T.Vector3(), parentQ = new T.Quaternion(), lowerQ = new T.Quaternion();
const poseTarget = new T.Quaternion();
const footTarget = new T.Vector3(), kneeTarget = new T.Vector3();
const footDirection = new T.Vector3(), kneeBend = new T.Vector3();
const shinRest = new T.Vector3(0,-.35,.055).normalize();
const footWorldQ = new T.Quaternion(), shinQ = new T.Quaternion();

function gatherStep(p, index) {
  const g=p.gather, spec=MOVES[g?.move];
  if(!spec?.takeoff) return null;
  const t=clamp(g.time/(g.duration*spec.takeoff),0,1);
  const lead=g.side>0 ? 1 : 0;
  let start, end, lateral=0, forward=0, lift=.10;
  if(g.move==='hop') {
    start=.08; end=.67; lift=.075;
    lateral=(index ? 1 : -1)*.06;
  } else if(g.move==='drop') {
    // Hold the pivot while the free foot steps around it; no full spin.
    start=index===lead ? .04 : .72;
    end=index===lead ? .64 : .98;
    lateral=index===lead ? g.side*.16 : 0;
    forward=index===lead ? -.12 : .08;
  } else {
    start=index===lead ? 0 : g.move==='pinoy' ? .60 : .43;
    end=index===lead ? .38 : .94;
    lateral=(index===lead ? 1 : -1)*g.side*(g.move==='euro' ? .12 : .05);
    if(g.move==='pinoy' && index!==lead) lift=.065;
  }
  return {swing:t>=start && t<end, progress:clamp((t-start)/(end-start),0,1),lateral,forward,lift};
}

// Stance targets stay in world space: moving the hips must not drag the shoes.
function plantFeet(c, p, dt, air) {
  const speed = Math.hypot(p.vx,p.vz);
  const fw = c.footwork ||= { x:p.x, z:p.z, feet:[] };
  const reset = air || Math.hypot(p.x-fw.x,p.z-fw.z)>1.2;
  fw.x=p.x; fw.z=p.z;
  c.root.updateMatrixWorld(true);
  c.root.getWorldQuaternion(footWorldQ);
  for(let i=0;i<2;i++) {
    const leg=c.legs[i], knee=c.knees[i], foot=c.feet[i];
    if(reset) { fw.feet[i]=null; continue; }
    const phase=((p.gait || 0)*1.5+i*.5)%1;
    const moving=speed>.15;
    const step=gatherStep(p,i);
    const swing=step ? step.swing : moving && phase>=.56;
    const f=fw.feet[i] ||= { position:new T.Vector3(), start:new T.Vector3(), end:new T.Vector3(), swing:false, initialized:false };
    const width=p.defending ? .23 : p.post ? .2 : .14;
    footTarget.set((i ? width : -width)+(step?.lateral || 0),0,step?.forward || 0).applyQuaternion(footWorldQ);
    footTarget.x+=p.x; footTarget.z+=p.z; footTarget.y=.065;
    if(!f.initialized) {
      f.position.copy(footTarget); f.start.copy(footTarget); f.end.copy(footTarget); f.initialized=true;
    }
    if(swing) {
      if(!f.swing) f.start.copy(f.position);
      // Predict a short landing spot; lateral movement produces an actual shuffle.
      const lead=Math.min(.10,.24/Math.max(speed,.01));
      footTarget.x+=p.vx*lead; footTarget.z+=p.vz*lead;
      f.end.lerp(footTarget,1-Math.exp(-dt*24));
      const t=step ? step.progress : clamp((phase-.56)/.44,0,1), smooth=t*t*(3-2*t);
      f.position.lerpVectors(f.start,f.end,smooth);
      f.position.y=.065+Math.sin(t*Math.PI)*(step ? step.lift : Math.min(.15,.045+speed*.018));
    } else {
      f.position.y=.065;
      // A stationary pivot or a sudden stop needs a small recovery step.
      if(!moving && !step && f.position.distanceTo(footTarget)>.22)
        f.position.lerp(footTarget,1-Math.exp(-dt*12));
    }
    f.swing=swing;
    footTarget.copy(f.position);
    c.body.worldToLocal(footTarget);
    footDirection.copy(footTarget).sub(leg.position);
    const upperLength=.38, lowerLength=Math.hypot(.35,.055);
    const distance=clamp(footDirection.length(),.12,upperLength+lowerLength-.005);
    footDirection.normalize();
    kneeBend.set(0,0,1).addScaledVector(footDirection,-footDirection.z).normalize();
    const along=(upperLength*upperLength+distance*distance-lowerLength*lowerLength)/(2*distance);
    kneeTarget.copy(leg.position).addScaledVector(footDirection,along)
      .addScaledVector(kneeBend,Math.sqrt(Math.max(0,upperLength*upperLength-along*along)));
    dir.copy(kneeTarget).sub(leg.position).normalize();
    leg.quaternion.setFromUnitVectors(down,dir);
    dir.copy(leg.position).addScaledVector(footDirection,distance).sub(kneeTarget).normalize();
    shinQ.setFromUnitVectors(shinRest,dir);
    knee.quaternion.copy(leg.quaternion).invert().multiply(shinQ);
    c.root.updateMatrixWorld(true);
    knee.getWorldQuaternion(parentQ);
    foot.quaternion.copy(parentQ).invert().multiply(footWorldQ);
  }
}

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
  const cycle = (p.gait || 0)*Math.PI*2;
  const stride = Math.sin(cycle)*Math.min(.75,speed*.19);
  const air = p.y > .015 || p.vy > .1;
  const landing = clamp((p.landing || 0)/.22,0,1)**1.4*.14;
  c.body.position.y = air ? 0 : -.07-Math.min(.05,speed*.008) + Math.abs(stride)*.025-landing;
  c.body.rotation.set(p.post ? -.12 : p.defending ? .17 : speed*.018,0,0);
  const lateral = Math.cos(p.angle)*p.vx-Math.sin(p.angle)*p.vz;
  c.body.rotation.z = -lateral*.025;
  const motion=c.motion ||= {vx:p.vx,vz:p.vz,forward:0,side:0};
  const frame=Math.max(dt,1/240);
  const ax=clamp((p.vx-motion.vx)/frame,-18,18), az=clamp((p.vz-motion.vz)/frame,-18,18);
  const response=1-Math.exp(-dt*10);
  motion.forward+=( (Math.sin(p.angle)*ax+Math.cos(p.angle)*az)*.012-motion.forward)*response;
  motion.side+=( (Math.cos(p.angle)*ax-Math.sin(p.angle)*az)*.012-motion.side)*response;
  motion.vx=p.vx; motion.vz=p.vz;
  if(!air) { c.body.rotation.x+=motion.forward; c.body.rotation.z-=motion.side; }
  if (c.upperBody) {
    c.upperBody.rotation.set(p.charging ? -.06 : speed*.012,
      Math.sin(cycle)*Math.min(.12,speed*.035),-c.body.rotation.z*.5);
    c.upperBody.position.y = 1.05+Math.sin(p.phase*2)*.004;
  }
  for (let i=0;i<2;i++) {
    const sign = i ? -1 : 1;
    c.legs[i].rotation.set(air ? (i === (p.hand===1?0:1) ? -.6 : .3) : stride*sign,0,p.defending ? sign*.15 : 0);
    c.knees[i].rotation.set(air ? .65 : .12 + Math.max(0,-stride*sign)*.85,0,0);
    c.feet[i].rotation.set(-c.knees[i].rotation.x*.4,0,0);
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
    if (p.moveKind === 'spin') c.body.rotation.y = t*Math.PI*2;
    if (p.moveKind === 'drop') c.body.rotation.y = Math.sin(t*Math.PI)*.85*(p.gather?.side || p.hand);
    if (p.moveKind === 'jab') { c.legs[hand].rotation.x = -Math.sin(t*Math.PI)*.55; c.legs[1-hand].rotation.x = 0; }
    if (p.moveKind === 'euro') c.body.rotation.z = Math.sin(t*Math.PI*2)*.3;
    if (p.moveKind === 'pinoy' && c.upperBody) c.upperBody.rotation.y += Math.sin(t*Math.PI)*.8*p.hand;
    if (p.moveKind === 'euro' && c.upperBody) c.upperBody.rotation.y += Math.sin(t*Math.PI*2)*.35;
  }
  const style = p.charging ? p.shotPlan || '' : p.shotStyle || '';
  if(p.gather && !air) {
    const spec=MOVES[p.gather.move];
    if(spec?.takeoff) {
      const t=clamp(p.gather.time/(p.gather.duration*spec.takeoff),0,1);
      // Load the final plant and rise into takeoff without inserting a pause.
      c.body.position.y-=Math.sin(t*Math.PI)* (p.gather.move==='hop' ? .10 : .045);
    }
  }
  if(air) {
    const twoFeet=/HOP|POWER|TWO HAND|FADE|JUMP/.test(style) || p.state==='BLOCKING';
    const descending=clamp(-(p.vy || 0)/3,0,1);
    for(let i=0;i<2;i++) {
      const driveKnee=i===(p.hand===1 ? 1 : 0);
      const hip=twoFeet ? -.16 : driveKnee ? -.85 : .25;
      c.legs[i].rotation.set(hip*(1-descending),0,(i ? -.06 : .06)*(1-descending));
      c.knees[i].rotation.set((twoFeet ? .48 : driveKnee ? .85 : .55)*(1-descending)+.12*descending,0,0);
      c.feet[i].rotation.set(-c.knees[i].rotation.x*.4,0,0);
    }
  }
  if (p.charging) {
    c.body.position.y -= Math.sin(clamp(p.charge/shotTiming(style),0,1)*Math.PI)*.12;
    c.knees.forEach(k => k.rotation.x += .25);
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
  // Solve after pose blending so smoothing cannot pull planted feet off the floor.
  plantFeet(c,p,dt,air);
  if (owns) {
    c.root.updateMatrixWorld(true);
    reach(c,hand,ball);
    if ((p.charging && (!/HOOK|SCOOP|JELLY|DUNK/.test(style) || style.includes('TWO HAND'))) || p.gather) reach(c,1-hand,ball);
  }
}
