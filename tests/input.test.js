import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../dist/src/input.js';

test('Escape consumes native dialog dismissal and toggles once per press', (t) => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  document.activeElement = { tagName: 'BODY' };
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  class KeyboardOnlyInput extends InputManager {
    bindTouch() {}
  }
  let paused = false;
  let toggles = 0;
  const input = new KeyboardOnlyInput(() => { paused = !paused; toggles++; });
  input.enabled = true;
  const press = (repeat = false, code = 'Escape') => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code, key: 'Escape', repeat });
    window.dispatchEvent(event);
    // A browser can only perform its native dialog dismissal if uncancelled.
    if (!event.defaultPrevented) paused = false;
    assert.equal(event.defaultPrevented, true);
  };
  press();
  assert.equal(paused, true);
  press(true);
  assert.equal(paused, true);
  assert.equal(toggles, 1);
  input.enabled = false;
  press(false, '');
  assert.equal(paused, false);
  assert.equal(toggles, 2);
});
