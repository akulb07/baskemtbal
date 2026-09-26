import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSimulation } from '../dist/src/simulation.js';
import { C, States } from '../dist/src/config.js';

function shot() {
  const g = new GameSimulation('practice');
  g.state = States.LIVE;
  Object.assign(g.players[0], { x: 0, z: 5, charge: .68, charging: true });
  g.release(g.players[0], { bank: false });
  return g;
}
const misses = g => g.events.filter(e => e.type === 'miss');

test('blocked shots never emit a brick, but the next unblocked miss does', () => {
  const g = shot();
  g.mode = 'ai';
  Object.assign(g.players[1], { x: 0, z: 3, y: .4, blockCd: .7 });
  Object.assign(g.ball, { x: .1, z: 3, y: 2.35, vx: 0, vz: 0, vy: 0, age: .2 });
  g.ballPhysics(C.dt);
  assert.equal(g.stats[1].blocks, 1);
  assert.equal(g.events.filter(e => e.type === 'block').length, 1);
  Object.assign(g.ball, { x: 6, z: 10, y: .13, vy: -2 });
  g.ballPhysics(C.dt);
  g.check(0);
  assert.equal(misses(g).length, 0);
  g.setupCheck();
  Object.assign(g.players[0], { charge: .68, charging: true });
  g.release(g.players[0], { bank: false });
  Object.assign(g.ball, { x: 6, z: 10, y: .13, vy: -2 });
  g.ballPhysics(C.dt);
  assert.equal(misses(g).length, 1);
});

test('a missed shot emits once despite repeated bounces', () => {
  const g = shot();
  Object.assign(g.ball, { x: 6, z: 10, y: .13, vx: 0, vz: 0, vy: -2 });
  for (let i = 0; i < 180; i++) g.step(C.dt);
  assert.equal(misses(g).length, 1);
});

test('misses include air rebounds and out-of-bounds shots', () => {
  const caught = shot();
  Object.assign(caught.ball, { x: 0, z: 5, y: 1.1, vx: 0, vz: 0, vy: -1, age: 1 });
  caught.step(C.dt);
  assert.equal(caught.ball.owner, 0);
  assert.equal(misses(caught).length, 1);
  const out = shot();
  Object.assign(out.ball, { x: 9, y: 4 });
  out.step(C.dt);
  assert.equal(misses(out).length, 1);
});

test('made baskets and loose balls without a shot do not emit misses', () => {
  const made = shot();
  for (let i = 0; i < 250; i++) made.step(C.dt);
  assert.ok(made.score[0] > 0);
  assert.equal(misses(made).length, 0);
  const loose = new GameSimulation('practice');
  loose.state = States.LOOSE;
  Object.assign(loose.ball, { owner: null, x: 6, z: 10, y: .13, vy: -2 });
  loose.step(C.dt);
  assert.equal(misses(loose).length, 0);
});
