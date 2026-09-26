import test from "node:test";
import assert from "node:assert/strict";
import { GameSimulation } from "../dist/src/simulation.js";
import { AIInputController } from "../dist/src/ai.js";
import { C, emptyInput, States } from "../dist/src/config.js";
const fresh = (mode = "practice") => {
  const g = new GameSimulation(mode);
  g.state = States.LIVE;
  return g;
};
const tick = (g, seconds, inputs = [emptyInput(), emptyInput()]) => {
  for (let i = 0; i < Math.round(seconds / C.dt); i++) g.step(C.dt, inputs);
};
const fire = (g, time = 0.68, bank = false) => {
  const p = g.players[0];
  p.charge = time;
  p.charging = true;
  g.release(p, { bank });
};
test("wide-open perfect shots physically score across reasonable distances", () => {
  for (const [x, z] of [
    [0, 5],
    [3, 6],
    [-3, 6],
    [0, 8],
    [-5, 5],
  ]) {
    const g = fresh();
    Object.assign(g.players[0], { x, z });
    fire(g);
    assert.equal(g.ball.owner, null);
    assert.equal(g.score[0], 0);
    tick(g, 2.3);
    assert.ok(g.score[0] > 0, `${x},${z}: ${JSON.stringify(g.ball)}`);
  }
});
test("downward scoring plane crossing counts once; upward crossing never counts", () => {
  const g = fresh();
  Object.assign(g.ball, {
    owner: null,
    x: 0,
    y: 3.08,
    z: C.hoop.z,
    vy: -2,
    vx: 0,
    vz: 0,
    age: 1,
  });
  g.state = States.SHOT;
  tick(g, 0.1);
  assert.equal(g.score[0], 1);
  tick(g, 0.6);
  assert.equal(g.score[0], 1);
  const up = fresh();
  Object.assign(up.ball, {
    owner: null,
    x: 0,
    y: 3,
    z: C.hoop.z,
    vy: 3,
    vx: 0,
    vz: 0,
    age: 1,
  });
  up.state = States.SHOT;
  tick(up, 0.05);
  assert.equal(up.score[0], 0);
});
test("rim collision redirects the basketball", () => {
  const g = fresh();
  Object.assign(g.ball, {
    owner: null,
    x: 0.23,
    y: 3.22,
    z: C.hoop.z,
    vy: -3,
    vx: 0,
    vz: 0,
    age: 1,
  });
  g.ballPhysics(0.03);
  assert.ok(g.ball.vy > 0);
  assert.ok(g.ball.rimTouched);
  assert.equal(g.score[0], 0);
});
test("very early misses do not automatically score", () => {
  const g = fresh();
  fire(g, 0.23);
  tick(g, 2);
  assert.equal(g.score[0], 0);
  assert.ok(g.ball.owner === null || g.state === States.DEAD);
});
test("short tap is a pump fake and retains possession", () => {
  const g = fresh();
  fire(g, 0.08);
  assert.equal(g.ball.owner, 0);
  assert.equal(g.stats[0].attempts, 0);
});
test("front defender contests substantially more than a rear defender", () => {
  const g = fresh("local");
  g.players[0].z = 6;
  g.players[1].x = 0;
  g.players[1].z = 5;
  const front = g.contest(0);
  g.players[1].z = 7;
  const rear = g.contest(0);
  assert.ok(front > rear * 3);
});
test("shot clock changes possession and check restores clock", () => {
  const g = fresh("local");
  g.clock = 0.03;
  tick(g, 0.1);
  assert.equal(g.state, States.DEAD);
  assert.equal(g.checkOwner, 1);
  tick(g, 3);
  assert.equal(g.ball.owner, 1);
  assert.ok(g.clock > 23);
});
test("defensive rebound needs a physical pickup and clearance", () => {
  const g = fresh("local");
  Object.assign(g.players[1], { x: 2, z: 5 });
  Object.assign(g.ball, {
    owner: null,
    x: 2,
    y: 1,
    z: 5,
    vy: -1,
    vx: 0,
    vz: 0,
    age: 1,
  });
  g.state = States.LOOSE;
  g.ballPhysics(C.dt);
  assert.equal(g.ball.owner, 1);
  assert.equal(g.needsClear, true);
  g.players[1].z = 9;
  g.step(C.dt, [emptyInput(), emptyInput()]);
  assert.equal(g.needsClear, false);
});
test("player collision prevents overlapping and moves consume stamina", () => {
  const g = fresh("local");
  g.players[1].x = g.players[0].x;
  g.players[1].z = g.players[0].z;
  g.resolvePlayers();
  assert.ok(
    Math.hypot(
      g.players[0].x - g.players[1].x,
      g.players[0].z - g.players[1].z,
    ) > 0.6,
  );
  const p = g.players[0],
    hand = p.hand;
  g.step(C.dt, [{ ...emptyInput(), move: "crossover" }, emptyInput()]);
  assert.equal(p.hand, -hand);
  assert.ok(p.stamina < 100);
});
test("block requires jump geometry and deflects ball", () => {
  const g = fresh("local");
  Object.assign(g.players[1], { x: 0, z: 3, y: 0.4, blockCd: 0.7 });
  Object.assign(g.ball, {
    owner: null,
    x: 0.1,
    y: 2.35,
    z: 3,
    vx: 0,
    vy: 1,
    vz: 0,
    shooter: 0,
    lastTouch: 0,
    age: 0.3,
  });
  g.state = States.SHOT;
  g.ballPhysics(C.dt);
  assert.equal(g.stats[1].blocks, 1);
  assert.equal(g.ball.owner, null);
  assert.ok(g.ball.vy < 0);
});
test("win-by-two and reset", () => {
  const g = fresh("local");
  g.score = [10, 10];
  Object.assign(g.ball, {
    owner: null,
    x: 0,
    y: 3.08,
    z: C.hoop.z,
    vy: -2,
    vx: 0,
    vz: 0,
    age: 1,
    shooter: 0,
    points: 1,
  });
  g.state = States.SHOT;
  g.ballPhysics(0.03);
  assert.deepEqual(g.score, [11, 10]);
  assert.equal(g.winner, null);
  g.state = States.SHOT;
  Object.assign(g.ball, {
    owner: null,
    x: 0,
    y: 3.08,
    z: C.hoop.z,
    vy: -2,
    vx: 0,
    vz: 0,
    age: 1,
    scored: false,
    points: 1,
  });
  g.ballPhysics(0.03);
  assert.equal(g.winner, 0);
  g.reset();
  assert.deepEqual(g.score, [0, 0]);
  assert.equal(g.winner, null);
});
test("AI scores, defends, rebounds, and completes a full match using shared rules", () => {
  const g = new GameSimulation("ai", { winScore: 3 });
  const a = [
    new AIInputController(0, "elite"),
    new AIInputController(1, "pro"),
  ];
  for (let i = 0; i < 120 * 900 && g.state !== States.OVER; i++)
    g.step(
      C.dt,
      a.map((c) => c.sample(g)),
    );
  assert.ok(g.score.reduce((a, b) => a + b, 0) > 0);
  assert.equal(
    g.state,
    States.OVER,
    JSON.stringify({ score: g.score, ball: g.ball }),
  );
  assert.ok(g.stats.some((s) => s.rebounds > 0));
});
test("sprint gather produces a dunk from an actual airborne release", () => {
  const g = fresh();
  Object.assign(g.players[0], { x: 0, z: 3.65, vz: -5.4 });
  const inputs = [
    { ...emptyInput(), z: -1, sprint: true, shoot: true },
    emptyInput(),
  ];
  tick(g, 0.525, inputs);
  assert.equal(g.players[0].shotPlan, "DUNK");
  assert.ok(g.players[0].y > 1.05);
  inputs[0].shoot = false;
  g.step(C.dt, inputs);
  assert.equal(g.lastShot.type, "DUNK");
  assert.ok(g.ball.y > 3.05);
  tick(g, 1);
  assert.equal(g.score[0], 1);
});
test("stationary close shot stays a layup", () => {
  const g = fresh();
  g.players[0].z = 3;
  fire(g, 0.53);
  assert.equal(g.lastShot.type, "LAYUP");
});
test("a bank shot hits the board before scoring", () => {
  const g = fresh();
  g.players[0].z = 5;
  fire(g, 0.68, true);
  tick(g, 2);
  assert.ok(g.events.some((e) => e.type === "board"));
  assert.equal(g.score[0], 1);
});
