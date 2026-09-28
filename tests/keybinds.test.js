import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYS, InputManager } from '../dist/src/input.js';
import { emptyInput } from '../dist/src/config.js';
import { loadBindings, rebind, keyLabel } from '../dist/src/keybinds.js';

test('defaults, custom keys and swaps survive JSON storage', () => {
  const keys = loadBindings();
  assert.deepEqual(keys, DEFAULT_KEYS[0]);
  assert.equal(rebind(keys, 'shoot', 'KeyW'), true);
  assert.equal(keys.up, 'Space');
  rebind(keys, 'right', 'ArrowRight');
  assert.deepEqual(loadBindings(JSON.parse(JSON.stringify(keys))), keys);
  assert.equal(new Set(Object.values(keys)).size, Object.keys(keys).length);
  assert.equal(DEFAULT_KEYS[0].up, 'KeyW');
  assert.equal(keyLabel('ArrowLeft'), 'Left');
});

test('invalid stored keys and reserved pause keys cannot replace controls', () => {
  const keys = loadBindings({ up: 'Escape', down: '<script>', left: null, shoot: 'KeyJ' });
  assert.equal(keys.up, 'KeyW');
  assert.equal(keys.down, 'KeyS');
  assert.equal(keys.left, 'KeyA');
  assert.equal(keys.shoot, 'KeyJ');
  assert.equal(rebind(keys, 'shoot', 'Escape'), false);
  assert.equal(rebind(keys, '__proto__', 'KeyJ'), false);
});

test('custom bindings drive actual input samples; old shoot key stops shooting', () => {
  const input = Object.create(InputManager.prototype);
  input.bindings = [loadBindings({ shoot: 'KeyJ', right: 'ArrowRight', defend: 'KeyK' })];
  input.keys = new Set(['KeyJ', 'ArrowRight', 'KeyK']);
  input.pressed = new Set(['KeyK']);
  input.touch = emptyInput();
  input.touchEdges = {};
  const sample = input.sample(0);
  assert.equal(sample.shoot, true);
  assert.equal(sample.x, 1);
  assert.equal(sample.block, true);
  assert.equal(Boolean(input.sample(0).block), false);
  input.keys = new Set(['Space']);
  assert.equal(input.sample(0).shoot, false);
});
