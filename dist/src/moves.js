// Durations and displacement describe footwork, shared by client and server.
export const MOVES = {
  crossover: { duration: .42, cost: 4, side: 1.15, forward: .18, switchHand: true },
  between: { duration: .46, cost: 4, side: .7, forward: .35, switchHand: true },
  behind: { duration: .5, cost: 5, side: 1, forward: .45, switchHand: true },
  hesitation: { duration: .6, cost: 4, side: .1, forward: .65 },
  spin: { duration: .65, cost: 7, side: .75, forward: .9, switchHand: true },
  inout: { duration: .5, cost: 4, side: .85, forward: .4 },
  stepback: { duration: .5, cost: 8, side: .15, forward: -1.25 },
  retreat: { duration: .5, cost: 5, side: 0, forward: -1 },
  jab: { duration: .4, cost: 2, side: .15, forward: .2 },
  euro: { duration: .62, takeoff: .58, cost: 7, side: .7, forward: 1.35, finish: 'EURO LAYUP' },
  pinoy: { duration: .64, takeoff: .6, cost: 7, side: .5, forward: 1.1, finish: 'PINOY LAYUP' },
  hop: { duration: .54, takeoff: .48, cost: 7, side: .6, forward: 1, finish: 'HOP LAYUP' },
  drop: { duration: .58, takeoff: .55, cost: 6, side: .65, forward: .9, finish: 'DROP STEP LAYUP' },
};
export const FINISHES = ['auto', 'scoop', 'jelly', 'hook', 'fade', 'reverse', 'floater', 'power', 'tomahawk', 'windmill'];
export function shotTiming(type) {
  return type.includes('LAYUP') || type.includes('DUNK') ? .53 : .68;
}
export function releasePoint(p, type) {
  const hook = type === 'HOOK', low = /SCOOP|JELLY/.test(type);
  const side = hook ? .58 : low ? .42 : .12;
  return { x: p.x + Math.cos(p.angle)*p.hand*side + Math.sin(p.angle)*.1,
    y: p.y + (hook ? 2.02 : low ? 1.5 : 1.98),
    z: p.z - Math.sin(p.angle)*p.hand*side + Math.cos(p.angle)*.1 };
}
