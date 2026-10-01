import { DEFAULT_KEYS } from './input.js';

export const KEY_ACTIONS = {
  up: 'Move forward', down: 'Move back', left: 'Move left', right: 'Move right',
  sprint: 'Sprint', shoot: 'Shoot / fake', move: 'Combo', cross: 'Crossover',
  step: 'Step back', steal: 'Steal', defend: 'Defend / block', bank: 'Bank shot',
  post: 'Post up', euro: 'Euro step', pinoy: 'Pinoy step', hop: 'Hop step',
  pass: 'Pass', switchPlayer: 'Switch player', screen: 'Screen', finishCycle: 'Next finish',
  moveCycle: 'Next move',
};
export function validKey(code) {
  return typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Space|Enter|Backspace|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Numpad[0-9])$/.test(code);
}
export function rebind(bindings, action, code) {
  if (!Object.hasOwn(KEY_ACTIONS, action) || !validKey(code)) return false;
  const duplicate = Object.keys(KEY_ACTIONS).find(key => key !== action && bindings[key] === code);
  if (duplicate) bindings[duplicate] = bindings[action];
  bindings[action] = code;
  return true;
}
export function loadBindings(saved) {
  const bindings = { ...DEFAULT_KEYS[0] };
  if (saved && typeof saved === 'object')
    for (const action of Object.keys(KEY_ACTIONS)) rebind(bindings, action, saved[action]);
  return bindings;
}
export function keyLabel(code) {
  return code.replace(/^Key|^Digit/, '').replace('Arrow', '').replace('ShiftLeft', 'Left Shift').replace('ShiftRight', 'Right Shift');
}
