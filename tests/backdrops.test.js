import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import { createBackdrop } from '../dist/src/backdrops.js';
import { SceneManager } from '../dist/src/rendering.js';

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
