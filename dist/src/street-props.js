import * as T from '../vendor/three.module.js';

const cube = new T.BoxGeometry(1,1,1);
const sphere = new T.SphereGeometry(1,12,8);
const cylinder = new T.CylinderGeometry(1,1,1,12);
const palette = new Map();
const mat = color => {
  if (!palette.has(color)) palette.set(color,new T.MeshStandardMaterial({color,roughness:.78}));
  return palette.get(color);
};

export function createStreetProps() {
  const root = new T.Group(); root.name='street-props';
  const prop = (name,x,z,angle=0) => {
    const g=new T.Group(); g.name=name; g.position.set(x,0,z); g.rotation.y=angle; root.add(g); return g;
  };
  const part = (g,geo,x,y,z,w,h,d,color) => {
    const m=new T.Mesh(geo,mat(color)); m.position.set(x,y,z); m.scale.set(w,h,d);
    m.castShadow=m.receiveShadow=true; g.add(m); return m;
  };
  const box = (g,x,y,z,w,h,d,c) => part(g,cube,x,y,z,w,h,d,c);
  const round = (g,x,y,z,r,h,c) => part(g,cylinder,x,y,z,r,h,r,c);

  const chai=prop('chai-cart',9.9,2.7,-Math.PI/2);
  box(chai,0,.65,0,2.1,.9,.85,0x247c7b);
  box(chai,0,1.15,0,2.25,.12,1,0x94694a);
  for(const x of [-1,1]) {
    box(chai,x,1.6,-.38,.065,1.35,.065,0x755037);
    for(const z of [-.35,.35]) {
      const wheel=round(chai,x,.27,z,.24,.09,0x25282a); wheel.rotation.x=Math.PI/2;
    }
  }
  for(let i=0;i<7;i++) box(chai,-1.05+i*.35,2.3,0,.35,.09,1.4,i%2?0xdcc294:0xb13732);
  round(chai,-.45,1.35,0,.19,.3,0xb6b6ac);
  part(chai,sphere,-.45,1.51,0,.2,.065,.2,0xc9c9be);
  round(chai,-.45,1.59,0,.035,.08,0x242829);
  const handle=part(chai,new T.TorusGeometry(.15,.024,5,12),-.65,1.37,0,1,1,1,0x333638);
  handle.rotation.y=Math.PI/2;
  const spout=round(chai,-.23,1.42,0,.045,.23,0xb6b6ac); spout.rotation.z=-.75;
  for(let i=0;i<5;i++) round(chai,.2+i*.14,1.26,.15,.045,.12,0xb36e43);
  box(chai,.55,.3,.8,.6,.6,.45,0x4b6c93);
  for(let i=0;i<3;i++) round(chai,.37+i*.18,.75,.8,.045,.32,0x408f65);

  const auto=prop('auto-rickshaw',-10,6.5,.12);
  box(auto,0,.63,0,1.45,.65,2.15,0x267447);
  box(auto,0,1.93,.05,1.52,.22,2.2,0xe9bd3c);
  box(auto,0,1.27,.9,1.4,1.15,.12,0x246940);
  box(auto,0,1.1,.45,1.12,.3,.5,0x22262a);
  box(auto,0,1.36,.64,1.12,.48,.12,0x22262a);
  for(const x of [-.66,.66]) {
    box(auto,x,1.42,-.88,.07,1,.08,0xe9bd3c);
    box(auto,x,1.38,.86,.075,1.1,.08,0xe9bd3c);
    const wheel=round(auto,x,.3,.55,.3,.16,0x242426); wheel.rotation.z=Math.PI/2;
    const hub=round(auto,x*1.14,.3,.55,.13,.02,0x888b86); hub.rotation.z=Math.PI/2;
  }
  box(auto,0,1.54,-.9,1.2,.55,.055,0x80a6a4);
  box(auto,0,1.15,-1.05,1.3,.22,.2,0xe9bd3c);
  const front=round(auto,0,.3,-.85,.3,.17,0x242426); front.rotation.z=Math.PI/2;
  for(const x of [-.45,.45]) part(auto,sphere,x,.98,-1.13,.1,.08,.04,0xeee0b8);
  box(auto,0,.62,-1.13,.44,.16,.025,0xe5c73d);

  const seats=prop('woven-seating',9.8,9);
  for(const x of [-.7,.7]) for(const z of [-.35,.35]) box(seats,x,.27,z,.09,.54,.09,0x705138);
  for(const z of [-.4,.4]) box(seats,0,.54,z,1.6,.09,.09,0x705138);
  for(let i=0;i<10;i++) box(seats,-.7+i*.155,.57,0,.08,.035,.8,i%2?0xa38a54:0xdbca91);
  for(let i=0;i<5;i++) box(seats,0,.6,-.32+i*.16,1.55,.025,.035,0xc7ac72);
  round(seats,0,.4,1.05,.3,.8,0xae6650);
  part(seats,sphere,0,.88,1.05,.42,.35,.42,0x476f45);
  return root;
}
