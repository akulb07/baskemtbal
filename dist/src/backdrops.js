import * as T from '../vendor/three.module.js';

// Stylized landmark silhouettes, kept outside the playable court.
const cube = new T.BoxGeometry(1,1,1);
const sphere = new T.SphereGeometry(1,12,8);
const materials = new Map();
const arches = new Map();
const material = color => {
  if (!materials.has(color)) materials.set(color,new T.MeshStandardMaterial({color,roughness:.85}));
  return materials.get(color);
};
export function createBackdrop(id) {
  const group = new T.Group();
  group.name = `map-${id}`;
  const mesh = (geometry,x,y,z,sx,sy,sz,color) => {
    const m = new T.Mesh(geometry,material(color));
    m.position.set(x,y,z); m.scale.set(sx,sy,sz);
    m.receiveShadow = true; group.add(m); return m;
  };
  const box = (x,y,z,w,h,d,c) => mesh(cube,x,y,z,w,h,d,c);
  const dome = (x,y,z,r,c) => mesh(sphere,x,y,z,r,r*.7,r,c);
  const arch = (x,y,z,r,c,legHeight=y) => {
    if (!arches.has(r)) arches.set(r,new T.TorusGeometry(r,r<1?.055:.22,6,24,Math.PI));
    mesh(arches.get(r),x,y,z,1,1,1,c);
    for (const side of [-1,1]) box(x+side*r,y-legHeight/2,z,.18,legHeight,.3,c);
  };
  const tree = (x,z,palm=false) => {
    box(x,2,z,.24,4,.24,0x70523a);
    if (palm) for (let i=0;i<6;i++) {
      const leaf=box(x,4.2,z,.35,.13,3.6,0x3c6850);
      leaf.rotation.y=i*Math.PI/3; leaf.rotation.x=.12;
    } else dome(x,4,z,1.7,0x436648);
  };
  const building = (x,z,w,h,c) => {
    box(x,h/2,z,w,h,3,c); box(x,h,z,w+.3,.22,3.3,0xdfc5a2);
    for (let y=1.3;y<h-.3;y+=1.7) for (let dx=-w/2+.6;dx<w/2;dx+=1.2)
      box(x+dx,y,z+1.52,.48,.85,.05,0x344b50);
  };
  const boat = (x,z) => {
    const hull=box(x,.05,z,2.4,.4,.7,0x754f35); hull.rotation.y=.18;
    box(x,.5,z,1.25,.08,.85,0xd3ba87);
    for (const s of [-1,1]) box(x+s*.55,.3,z,.05,.5,.06,0x563e2f);
  };
  const water = z => {
    box(0,-.16,z,110,.12,30,0x397d89);
    for(let i=0;i<30;i++) box(Math.sin(i*7)*40,-.09,z-12+(i%13)*2,2+(i%3),.012,.035,0x7aafb3);
  };
  if (id === '1') {
    // Gateway waterfront: open central arch and four domed corner turrets.
    water(-30);
    const z=-13, stone=0xbea477;
    box(0,.12,-8,48,.25,6,0xc7b798);
    for (const x of [-4.2,4.2]) box(x,4.7,z,3.1,9.4,3.2,stone);
    arch(0,6.1,z+1.7,2.65,0xe0c697);
    box(0,10.05,z,11.5,2.2,3.3,stone);
    box(0,11.3,z,12,.38,3.7,0xe0c697);
    for (const x of [-4.6,4.6]) for (const dz of [-1.2,1.2]) {
      box(x,12.1,z+dz,.85,1.6,.85,stone); dome(x,13,z+dz,.72,0xd3ba87);
      box(x,13.7,z+dz,.08,.5,.08,0x78684e);
    }
    for (const x of [-4.2,4.2]) arch(x,3.5,z+1.65,.72,0xe0c697);
    for(let i=0;i<5;i++) building(-22+i*4.3,-24,3.8,6+i%3*2,0xdcc5a4);
    for (const x of [-15,15,22]) tree(x,-6,true);
    boat(13,-25); boat(-13,-32);
    for(let x=-23;x<=23;x+=2) box(x,.6,-10,.15,1.2,.15,0xb5a58a);
    box(0,1.1,-10,48,.15,.16,0xb5a58a);
  } else if (id === '2') {
    // Pink sandstone, stepped crown and rows of projecting jharokha windows.
    const z=-15;
    box(0,.15,-8,50,.3,9,0xc8a18b);
    for(let col=-6;col<=6;col++) {
      const floors=5-Math.floor(Math.abs(col)/2.5), x=col*1.7;
      box(x,floors*1.25,z,1.72,floors*2.5,3,0xc97663);
      for(let row=0;row<floors;row++) {
        const y=1.2+row*2.5;
        box(x,y,z+1.55,1.3,1.9,.2,0xe8ad89);
        box(x,y,z+1.68,.7,1.3,.08,0x694b49);
        arch(x,y+.42,z+1.75,.38,0xf2c79d,.9);
        box(x,y-.8,z+1.8,1.4,.16,.65,0xf0c29b);
        for(let k=-1;k<=1;k++) box(x+k*.2,y,z+1.75,.045,1.3,.04,0xe7b58e);
      }
      dome(x,floors*2.5+.25,z+1.3,.6,0xe9a786);
      box(x,floors*2.5+.85,z+1.3,.07,.45,.07,0xf2c79d);
    }
    for(const side of [-1,1]) for(let i=0;i<3;i++) {
      building(side*(15+i*5),-14,4.7,5+i%2,0xd1947c);
      box(side*(15+i*5),2,-11.9,4.6,.18,1.5,i%2?0xb53f39:0xd49d45);
    }
    tree(-13,-5); tree(13,-5);
  } else if (id === '3') {
    // A riverside court looking over water toward stepped ghats.
    water(-18);
    for(let i=0;i<8;i++) box(0,i*.28,-27-i*.7,62,.3,1.5,0xb99875);
    for(let i=-6;i<=6;i++) {
      const h=5+(i*i%4)*1.5;
      building(i*4.5,-35,4.4,h,[0xc4a578,0xd6b995,0xb87c63,0xd1ae72][(i+6)%4]);
    }
    for (const x of [-16,8,20]) {
      box(x,4,-32,2.6,5,2.8,0xc59463);
      mesh(new T.ConeGeometry(1.9,5,8),x,8.7,-32,1,1,1,0xc99c68);
      box(x,11.4,-32,.1,.9,.1,0xad803b);
    }
    boat(-7,-15); boat(9,-21); boat(-19,-22);
    box(0,.28,-5,38,.55,.6,0xa38b73);
    for(let x=-18;x<=18;x+=3) { box(x,1,-5,.22,1.5,.22,0xc3a988); dome(x,1.8,-5,.23,0xc3a988); }
    tree(-12,-3); tree(12,-3);
  } else if (id === '4') {
    // India Gate: broad sandstone piers, central arch, heavy cornices and lawns.
    const z=-18, stone=0xcaa77f;
    // Stop behind the pavement (z=-4.5). The old lawn reached z=-1,
    // overlapping the court foundation at the identical y=-.025 surface.
    box(0,-.1,-19,70,.15,29,0x6d8256);
    box(0,.02,-14,8,.15,20,0xc8b797);
    for(const x of [-4.4,4.4]) {
      // Meet the plinth and lintel at their edges; overlapping coplanar faces flicker.
      box(x,4.85,z,3.8,8.3,4.2,stone);
      box(x,.35,z,4.5,.7,4.8,0xaf8c67);
      for(const dx of [-1.5,1.5]) box(x+dx,5,z+2.18,.22,9.5,.25,0xe2c39d);
    }
    arch(0,6.4,z+2.15,2.6,0xe1c19a,5.75);
    box(0,10.5,z,12.6,3,4.3,stone);
    box(0,12.2,z,13.4,.45,4.9,0xe1c19a);
    box(0,12.9,z,10.9,1.1,3.9,stone);
    box(0,13.55,z,11.6,.3,4.3,0xdfbd95);
    mesh(new T.CylinderGeometry(1.2,.8,.45,16),0,13.9,z,1,1,1,0xab865c);
    for(const side of [-1,1]) for(let i=0;i<6;i++) {
      tree(side*(12+i*4),-10-(i%2)*10);
      box(side*7,1.6,-5-i*5,.08,3.2,.08,0x38473f);
      dome(side*7,3.3,-5-i*5,.23,0xe6d1a4);
    }
    for(let i=-2;i<=2;i++) building(i*5,-44,4.7,3.5,0xb89f7f);
  }
  // Batch static repeated geometry so hundreds of windows don't cost hundreds of draw calls.
  const batches = new Map();
  for (const child of [...group.children]) {
    const key = `${child.geometry.uuid}:${child.material.uuid}`;
    if (!batches.has(key)) batches.set(key,[]);
    batches.get(key).push(child);
  }
  for (const items of batches.values()) {
    if (items.length < 2) continue;
    const batch = new T.InstancedMesh(items[0].geometry,items[0].material,items.length);
    items.forEach((item,i) => { item.updateMatrix(); batch.setMatrixAt(i,item.matrix); group.remove(item); });
    batch.receiveShadow = true;
    batch.computeBoundingSphere();
    group.add(batch);
  }
  return group;
}
