import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import { createBackdrop } from '../dist/src/backdrops.js';
import { SceneManager } from '../dist/src/rendering.js';
import { createStreetProps } from '../dist/src/street-props.js';

test('all four backdrops stay behind the court and batch their repeated geometry', () => {
  for (const id of ['1','2','3','4']) {
    const group=createBackdrop(id);
    const bounds=new T.Box3().setFromObject(group);
    assert.ok(bounds.max.z<0,`Map ${id} intrudes onto the court`);
    assert.ok(bounds.max.y>10,`Map ${id} missing landmark`);
    assert.ok(group.children.length<45,`Map ${id} creates too many draw calls`);
    assert.ok(group.children.some(m=>m.isInstancedMesh));
  }
});

test('switching maps reuses scenery and preserves day/night selection', () => {
  const scene=Object.create(SceneManager.prototype);
  scene.environment=new T.Group(); scene.backdrops=new Map(); scene.currentMap='night';
  for(const id of ['1','4','2','3','1','4']) scene.setLocation(id);
  assert.equal(scene.backdrops.size,4);
  assert.equal(scene.environment.children.filter(g=>g.visible).length,1);
  assert.equal(scene.backdrops.get('4').visible,true);
  assert.equal(scene.currentMap,'night');
});

test('street props stay outside the sidelines and fence', () => {
  const props=createStreetProps();
  props.updateMatrixWorld(true);
  assert.equal(props.children.length,3);
  for (const prop of props.children) {
    const b=new T.Box3().setFromObject(prop);
    assert.ok(b.min.x>8.3 || b.max.x< -8.3,`${prop.name} enters the fence`);
  }
});

test('Map 4 has no overlapping coplanar box faces', () => {
  const boxes=[];
  // Include the real court foundation, not just faces inside the backdrop.
  // Stop createCourt at its first box so this geometry check needs no DOM/WebGL.
  const captured = new Error('foundation captured');
  try {
    SceneManager.prototype.createCourt.call({box(x,y,z,w,h,d) {
      boxes.push(new T.Box3(
        new T.Vector3(x-w/2,y-h/2,z-d/2),
        new T.Vector3(x+w/2,y+h/2,z+d/2),
      ));
      throw captured;
    }});
  } catch (error) { if (error !== captured) throw error; }
  assert.equal(boxes.length,1);
  for(const m of createBackdrop('4').children) {
    if(m.geometry.type!=='BoxGeometry') continue;
    for(let i=0;i<(m.isInstancedMesh?m.count:1);i++) {
      const matrix=new T.Matrix4();
      if(m.isInstancedMesh) m.getMatrixAt(i,matrix);
      else { m.updateMatrix(); matrix.copy(m.matrix); }
      boxes.push(new T.Box3(new T.Vector3(-.5,-.5,-.5),new T.Vector3(.5,.5,.5)).applyMatrix4(matrix));
    }
  }
  for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
    const a=boxes[i],b=boxes[j];
    for(const axis of ['x','y','z']) for(const face of ['min','max']) {
      if(Math.abs(a[face][axis]-b[face][axis])>1e-5) continue;
      const overlap=['x','y','z'].filter(k=>k!==axis).every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>.001);
      assert.equal(overlap,false,`Boxes ${i}/${j} share an overlapping ${axis} face`);
    }
  }
});
