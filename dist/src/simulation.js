import { C, clamp, length, attributes, emptyInput, States } from "./config.js";
import { MOVES, FINISHES, shotTiming, releasePoint, releaseWindow } from './moves.js';

export class Player {
  constructor(id) {
    Object.assign(this, {
      id,
      team: id % 2,
      post: false,
      screen: false,
      finish: 'auto',
      shotStyle: '',
      passCd: 0,
      passHeld: false,
      gather: null,
      gait: 0,
      landing: 0,
      x: id ? 1.3 : 0,
      z: id ? 6 : 8,
      vx: 0,
      vz: 0,
      y: 0,
      vy: 0,
      angle: Math.PI,
      stamina: 100,
      hand: id ? -1 : 1,
      phase: 0,
      state: "TRIPLE_THREAT",
      charge: 0,
      charging: false,
      shotHeld: false,
      moveTime: 0,
      moveKind: "",
      cooldown: 0,
      stealCd: 0,
      blockCd: 0,
      recover: 0,
      animation: 0,
      cleared: true,
      attributes: attributes(),
    });
  }
}

export class GameSimulation {
  constructor(mode = "ai", options = {}) {
    this.mode = mode;
    this.options = { winScore: C.winScore, shotClock: C.shotClock, ...options };
    this.reset();
  }
  reset() {
    this.players = Array.from({ length: this.mode === 'team' ? 6 : this.mode === 'online2v2' ? 4 : 2 }, (_, i) => new Player(i));
    if (this.players.length > 2) this.players.forEach((p, i) => {
      p.x = i < 2 ? 0 : i < 4 ? -4.7 : 4.7;
      p.z = i % 2 ? 5.8 : 8;
    });
    this.ball = {
      x: 0,
      y: 1,
      z: 8,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: 0,
      hand: 1,
      phase: 0,
      lastTouch: 0,
      shooter: 0,
      points: 1,
      age: 0,
      scored: false,
      shotPending: false,
      rimTouched: false,
      boardTouched: false,
    };
    this.score = [0, 0];
    this.stats = this.players.map(() => this.newStats());
    this.state = States.CHECK;
    this.timer = 1.5;
    this.clock = this.options.shotClock;
    this.time = 0;
    this.eventId = 0;
    this.events = [];
    this.feedback = null;
    this.winner = null;
    this.needsClear = false;
    this.checkOwner = 0;
    this.possession = 0;
    this.lastShot = null;
    this.updateHeldBall();
  }
  newStats() {
    return {
      made: 0,
      attempts: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      perfect: 0,
      assists: 0,
    };
  }
  emit(type, data = {}) {
    this.events.push({ id: ++this.eventId, type, time: this.time, ...data });
    if (this.events.length > 32) this.events.shift();
  }
  check(owner, message = "CHECK BALL") {
    this.recordMiss();
    this.checkOwner = owner;
    this.possession = owner;
    this.state = States.DEAD;
    this.timer = 1.3;
    this.emit("message", { text: message });
  }
  setupCheck() {
    const id = this.checkOwner;
    this.players.forEach((p, i) => {
      p.x = i === id ? 0 : 1.25;
      p.z = i === id ? 8.5 : 6.1;
      if (this.players.length > 2 && i >= 2) {
        p.x = i < 4 ? -4.7 : 4.7;
        p.z = this.team(i) === this.team(id) ? 8 : 6;
      }
      p.vx = p.vz = p.y = p.vy = 0;
      p.charging = false;
      p.charge = 0;
      p.shotHeld = false;
      p.gather = null;
      p.queuedMove = null;
      p.moveTime = p.animation = p.cooldown = 0;
      p.post = p.screen = false;
      p.passHeld = false;
      p.shotPlan = null;
      p.state = i === id ? "TRIPLE_THREAT" : "DEFENDING";
      p.stamina = Math.max(p.stamina, 65);
    });
    Object.assign(this.ball, {
      owner: id,
      lastTouch: id,
      age: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      scored: false,
      shotPending: false,
      rimTouched: false,
      boardTouched: false,
      passing: false,
      passFrom: null,
      assistFrom: null,
    });
    this.clock = this.options.shotClock;
    this.needsClear = false;
    this.state = States.CHECK;
    this.timer = 1.2;
    this.updateHeldBall();
  }
  distance(p) {
    return length(p.x, p.z - C.hoop.z);
  }
  team(id) { return this.players[id]?.team ?? (id % 2); }
  opponents(id) { return this.players.filter(p => this.team(p.id) !== this.team(id)); }
  opponent(id) {
    const p = this.players[id];
    return this.opponents(id).sort((a,b) => length(a.x-p.x,a.z-p.z)-length(b.x-p.x,b.z-p.z))[0];
  }
  otherTeam(id) { return 1 - this.team(id); }
  teamStats(team) {
    return this.stats.reduce((sum, s, id) => {
      if (this.team(id) === team) for (const key of Object.keys(sum)) sum[key] += s[key] || 0;
      return sum;
    }, this.newStats());
  }
  isTwo(p) {
    return this.distance(p) >= 6.75 || (Math.abs(p.x) > 6.6 && p.z < 3);
  }
  contest(id, positions = this.players) {
    if (this.mode === "practice") return 0;
    positions ??= this.players;
    const p = positions[id],
      defenders = positions.filter((d, index) => this.team(d.id ?? index) !== this.team(id));
    return Math.max(0, ...defenders.map(d => {
    const dx = d.x - p.x,
      dz = d.z - p.z,
      dist = length(dx, dz);
    const hx = -p.x,
      hz = C.hoop.z - p.z,
      hd = length(hx, hz) || 1;
    const angle = (dx * hx + dz * hz) / ((dist || 1) * hd);
    const front = clamp((angle + 0.25) / 1.1, 0.08, 1);
    return clamp(
      (1 - dist / 2.6) * front * (d.defending ? 1.08 : 0.75) +
        (d.y > 0.25 && dist < 1.4 ? 0.18 : 0),
      0,
      0.98,
    );
    }));
  }
  lane(id) {
    if (this.mode === 'practice') return 'OPEN';
    const p = this.players[id];
    const hx = -p.x,
      hz = C.hoop.z - p.z,
      l = length(hx, hz) || 1;
    let lane = 'OPEN';
    for (const d of this.opponents(id)) {
      const proj = ((d.x-p.x)*hx+(d.z-p.z)*hz)/l;
      const perp = Math.abs((d.x-p.x)*hz-(d.z-p.z)*hx)/l;
      if (proj < 0 || proj > l || perp > 1.2) continue;
      if (perp < .6) return 'CUT OFF';
      lane = 'CONTESTED';
    }
    return lane;
  }
  canDunk(p) {
    const distance = this.distance(p),
      speed = length(p.vx, p.vz);
    const approach =
      (-p.x * p.vx + (C.hoop.z - p.z) * p.vz) /
      ((distance || 1) * (speed || 1));
    return (
      distance < 2.4 &&
      distance > 0.45 &&
      speed > 3.15 &&
      approach > 0.5 &&
      p.stamina > 28 &&
      this.contest(p.id) < 0.4
    );
  }
  shotType(p, input) {
    const dist = this.distance(p),
      speed = length(p.vx, p.vz);
    if (p.shotPlan && p.charging) return p.shotPlan;
    const finish = input.finish || p.finish || 'auto';
    if (p.gather && dist < 4) return p.gather.type;
    if (finish === 'hook' && dist < 4.5) return 'HOOK';
    if (finish === 'fade' || (p.post && dist >= 2.1)) return 'FADEAWAY';
    if (dist < 3.2 && ['scoop','jelly','reverse'].includes(finish)) return `${finish.toUpperCase()} LAYUP`;
    if (finish === 'floater' && dist < 5) return 'FLOATER';
    if (this.canDunk(p)) return finish === 'power' ? 'TWO HAND DUNK' : finish === 'tomahawk' ? 'TOMAHAWK DUNK' : finish === 'windmill' ? 'WINDMILL DUNK' : 'DUNK';
    if (dist < 2.1) return p.z < C.hoop.z ? "REVERSE LAYUP" : "LAYUP";
    if (dist < 3.3 && speed > 1.5) return "FLOATER";
    if (input.bank) return "BANK SHOT";
    if (p.moveKind === "stepback" && p.moveTime > 0) return "STEPBACK";
    if (p.vz > 1.2) return "FADEAWAY";
    return speed > 1 ? "PULL-UP" : "JUMP SHOT";
  }
  release(p, input, positions) {
    if (this.outsideCourt(p)) {
      this.check(this.mode === 'practice' ? 0 : this.otherTeam(p.id), 'OUT OF BOUNDS');
      return;
    }
    const duration = p.charge;
    let type = this.shotType(p, input);
    p.charging = false;
    p.charge = 0;
    p.shotPlan = null;
    if (duration < 0.15) {
      p.animation = 0.25;
      p.state = "GATHERING";
      this.emit("pump", { player: p.id });
      return;
    }
    const dist = this.distance(p),
      contest = this.contest(p.id, positions),
      speed = length(p.vx, p.vz);
    if (type.includes('DUNK') && (p.y < 1.05 || dist > 2.5 || contest > 0.65))
      type = "LAYUP";
    const ideal =
      shotTiming(type);
    const timing = duration - ideal;
    const window = releaseWindow(dist, contest, p.stamina, speed);
    const perfect = Math.abs(timing) < window;
    const quality = clamp(
      1 -
        Math.abs(timing) * 1.6 -
        contest * 0.55 -
        Math.max(0, dist - 7) * 0.12 -
        speed * 0.022 -
        (100 - p.stamina) * 0.001,
      0,
      1,
    );
    const label = perfect
      ? "PERFECT"
      : Math.abs(timing) < 0.1
        ? timing < 0
          ? "SLIGHTLY EARLY"
          : "SLIGHTLY LATE"
        : Math.abs(timing) < 0.23
          ? timing < 0
            ? "EARLY"
            : "LATE"
          : timing < 0
            ? "VERY EARLY"
            : "VERY LATE";
    const start = releasePoint(p, type);
    p.shotStyle = type;
    p.gather = null;
    let tx = 0,
      tz = C.hoop.z;
    let error =
      perfect && contest < 0.18 ? 0 : (1 - quality) * 0.82;
    // Extreme range keeps a small accuracy risk even on an open green.
    // Ease in beyond 8.5m, capped at a 25% chance of added spread at 12.5m.
    const rangeRisk = clamp((dist-8.5)/4,0,1)*.25;
    if (rangeRisk > 0 && !type.includes('DUNK') && !type.includes('LAYUP')) {
      const random = this.options.random || Math.random;
      if (random() < rangeRisk) error = Math.max(error,.40+random()*.14);
    }
    const direction =
      (p.id ? -0.7 : 0.7) + Math.sin(this.stats[p.id].attempts * 2.4) * 0.55;
    tx += error * direction;
    tz += error * (timing < 0 ? 1 : -1) * 1.05;
    let targetY = C.hoop.y;
    let apex = Math.max(start.y + 0.9, 4.4 + dist * 0.14);
    if (type.includes('DUNK')) {
      apex = Math.max(start.y + 0.08, 3.6);
      tx = p.x * 0.035 + error * 0.22;
      tz = C.hoop.z + error * (timing < 0 ? 0.5 : -0.5);
    } else if (type.includes("LAYUP")) apex = Math.max(start.y + 0.2, 3.9);
    if (type === 'HOOK' || type === 'FLOATER') apex += .6;
    if (type === "BANK SHOT") {
      targetY = C.hoop.y;
      tz = 1.2 - (C.hoop.z - 1.2) / 0.74;
      apex = 4.6;
      tx *= 0.3;
    }
    const vy = Math.sqrt(2 * C.gravity * (apex - start.y));
    const flight =
      vy / C.gravity + Math.sqrt((2 * (apex - targetY)) / C.gravity);
    Object.assign(this.ball, {
      ...start,
      vx: (tx - start.x) / flight,
      vy,
      vz: (tz - start.z) / flight,
      owner: null,
      shooter: p.id,
      lastTouch: p.id,
      points: this.isTwo(p.shotOrigin || p) ? 2 : 1,
      shotType: type,
      shotDistance: dist,
      shotPending: true,
      age: 0,
      scored: false,
      rimTouched: false,
      boardTouched: false,
      passing: false,
    });
    this.stats[p.id].attempts++;
    if (perfect) this.stats[p.id].perfect++;
    this.state = States.SHOT;
    p.state =
      type.includes('DUNK') ? "DUNK" : type.includes("LAYUP") ? "LAYUP" : "SHOOTING";
    p.animation = 0.65;
    if (!type.includes('DUNK') && p.y === 0) p.vy = 3.5;
    if (type === 'FADEAWAY') {
      const d = this.distance(p) || 1;
      p.vx = p.x / d * 2.2; p.vz = (p.z-C.hoop.z)/d*2.2;
    }
    p.stamina = clamp(p.stamina - (type.includes('DUNK') ? 10 : 5), 0, 100);
    this.lastShot = {
      player: p.id,
      label,
      perfect,
      type,
      contest,
      distance: dist,
      quality,
      timing,
    };
    this.feedback = { ...this.lastShot, until: this.time + 2.6 };
    this.emit("shot", this.lastShot);
  }
  movePlayer(p, input, dt) {
    p.passCd = Math.max(0, p.passCd - dt);
    p.stealCd = Math.max(0, p.stealCd - dt);
    p.blockCd = Math.max(0, p.blockCd - dt);
    p.recover = Math.max(0, p.recover - dt);
    p.moveTime = Math.max(0, p.moveTime - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.animation = Math.max(0, p.animation - dt);
    p.landing = Math.max(0, (p.landing || 0)-dt);
    const owns = this.ball.owner === p.id;
    if (!owns) p.gather = null;
    if (!owns || p.charging || this.time > (p.queuedUntil || 0)) p.queuedMove = null;
    if (owns && !p.gather && !p.charging && MOVES[input.move] && p.cooldown > 0 && p.cooldown <= .14) {
      p.queuedMove = input.move;
      p.queuedUntil = this.time+.15;
    }
    if (owns && p.cooldown <= 0 && p.queuedMove) {
      input = {...input, move: input.move || p.queuedMove};
      p.queuedMove = null;
    }
    p.post = owns && !!input.post && !p.gather;
    p.screen = !owns && !!input.screen && length(p.vx,p.vz) < .5;
    p.finish = FINISHES.includes(input.finish) ? input.finish : 'auto';
    p.defending = !!input.defend && !owns;
    const magnitude = Math.min(1, length(input.x, input.z)),
      norm = length(input.x, input.z) || 1;
    let speed =
      (input.sprint ? C.sprintSpeed : C.speed) *
      (p.stamina < 15 ? 0.78 : 1) *
      (p.defending ? 0.72 : 1) *
      (p.post ? .3 : 1) *
      (p.screen ? 0 : 1) *
      (p.charging ? 0.32 : 1) *
      (p.recover > 0 ? 0.4 : 1);
    const accel = C.acceleration * (p.stamina < 15 ? 0.8 : 1) * (p.y > .05 ? .12 : 1);
    const approach = (v, t, a) => v + clamp(t - v, -a * dt, a * dt);
    p.vx = approach(
      p.vx,
      (input.x / norm) * magnitude * speed,
      p.y > .05 ? accel : magnitude ? accel : C.deceleration,
    );
    p.vz = approach(
      p.vz,
      (input.z / norm) * magnitude * speed,
      p.y > .05 ? accel : magnitude ? accel : C.deceleration,
    );
    if (owns && MOVES[input.move] && p.cooldown <= 0 && p.stamina > 8 && !p.gather && !p.charging) {
      const move = input.move, spec = MOVES[move];
      // Gather steps only begin within finishing range.
      if (spec.finish && this.distance(p) >= 4.5) input = { ...input, move: null };
      else {
      p.moveKind = move;
      if (spec.switchHand) p.hand *= -1;
      p.stamina -= spec.cost;
      const toward = length(p.x, p.z - C.hoop.z) || 1;
      const fx = -p.x/toward, fz = (C.hoop.z-p.z)/toward;
      const side = (input.x || p.hand) > 0 ? 1 : -1;
      if (move === 'hesitation') {
        p.vx *= 0.4;
        p.vz *= 0.4;
      } else {
        p.vx += (fx*spec.forward-fz*spec.side*side)*2.4;
        p.vz += (fz*spec.forward+fx*spec.side*side)*2.4;
      }
      p.state = "DRIBBLE_MOVE";
      this.emit("move", { player: p.id, move });
      p.moveTime = spec.duration;
      p.moveDuration = spec.duration;
      p.cooldown = spec.duration + (spec.recovery || 0);
      // Finish footwork commits to a gather; the ball cannot be dribbled again.
      if (spec.finish && this.distance(p) < 4.5) {
        const d = this.distance(p) || 1;
        p.gather = { type: spec.finish, time: 0, duration: spec.duration,
          x: p.x, z: p.z, fx: -p.x/d, fz: (C.hoop.z-p.z)/d,
          side: (input.x || p.hand) > 0 ? 1 : -1, move };
        p.charging = true;
        p.shotPlan = spec.finish;
        p.shotOrigin = null;
        p.tookOff = false;
        p.charge = 0;
      }
      if (move === 'jab') { p.vx = p.vz = 0; }
      }
    }
    if (p.gather && owns) {
      const g = p.gather, spec = MOVES[g.move];
      g.time += dt;
      const t = clamp(g.time/g.duration,0,1);
      const lateral = spec.side * g.side * (g.move === 'euro' ? Math.sin(t*Math.PI*1.5) : Math.sin(t*Math.PI/2));
      const progress = g.move === 'pinoy' ? t*.8+t*t*.2 : t;
      const x = g.x + g.fx*spec.forward*progress - g.fz*lateral;
      const z = g.z + g.fz*spec.forward*progress + g.fx*lateral;
      // Contact can stop a gather; never teleport through a defender to catch up.
      if (!p.tookOff) {
        p.vx = clamp((x-p.x)/dt,-5.5,5.5); p.vz = clamp((z-p.z)/dt,-5.5,5.5);
      }
      p.charge = t*shotTiming(g.type);
      if (t >= spec.takeoff && !p.tookOff) {
        p.vy = 4.1;
        p.tookOff = true;
        p.shotOrigin = {x:p.x,z:p.z};
        p.vx = g.fx*2.2; p.vz = g.fz*2.2;
      }
      if (input.shoot) g.aimed = true;
      if (t >= 1 || (g.aimed && !input.shoot && t >= spec.takeoff+.16)) {
        if (!g.aimed) p.charge += .065;
        this.release(p, input);
      }
    }
    const oldZ = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const wasOut = this.outsideCourt(p);
    if (wasOut && owns) {
      this.check(this.mode === 'practice' ? 0 : this.otherTeam(p.id), "OUT OF BOUNDS");
      return;
    }
    p.x = clamp(p.x, -7.3, 7.3);
    p.z = clamp(p.z, C.baseline+.2, 13.8);
    p.y += p.vy * dt;
    p.vy -= C.gravity * dt;
    if (p.y <= 0) {
      if (p.vy < -1) p.landing = .22;
      p.y = 0;
      p.vy = 0;
    }
    // The baseline is playable under the board; an airborne body cannot pass through it.
    this.resolveBackboard(p, oldZ);
    if (input.block && !owns && p.blockCd === 0 && p.y === 0 && p.stamina > 5) {
      p.vy = C.jumpVelocity;
      p.blockCd = C.blockCooldown;
      p.stamina -= 7;
      p.state = "BLOCKING";
      p.animation = 0.6;
      this.emit("jump", { player: p.id });
    }
    if (input.steal && !owns && p.stealCd === 0) {
      p.stealCd = C.stealCooldown;
      p.recover = 0.3;
      p.state = "STEALING";
      p.animation = 0.3;
      p.stamina = Math.max(0, p.stamina - 5);
      const b = this.ball;
      const bd = length(b.x - p.x, b.z - p.z);
      if (
        b.owner !== null &&
        this.team(b.owner) !== this.team(p.id) &&
        bd < 0.95 &&
        b.y < 0.9 &&
        this.players[b.owner].moveTime < 0.35
      ) {
        this.stats[p.id].steals++;
        this.players[b.owner].recover = 0.35;
        b.owner = null;
        b.vx = p.vx * 0.5;
        b.vz = p.vz * 0.5 + 1.8;
        b.vy = 1.5;
        b.lastTouch = p.id;
        b.age = 0;
        this.state = States.LOOSE;
        this.emit("steal", { player: p.id });
      }
    }
    const active = input.sprint && magnitude > 0.1;
    p.stamina = clamp(
      p.stamina + (active ? -9 : p.defending && magnitude > 0.1 ? -1 : 8) * dt,
      0,
      100,
    );
    p.phase += dt * (2.1 + length(p.vx, p.vz) * 0.35);
    p.gait = (p.gait || 0) + length(p.vx,p.vz)*dt/(p.defending ? 1.2 : 1.65);
    if (magnitude > 0.1 && !p.defending) p.angle = Math.atan2(p.vx, p.vz);
    else p.angle = Math.atan2(-p.x, C.hoop.z - p.z);
    if (p.post) p.angle = Math.atan2(p.x, p.z - C.hoop.z);
    if (p.charging || p.gather) p.angle = Math.atan2(-p.x, C.hoop.z-p.z);
    if (p.animation <= 0 && p.moveTime <= 0)
      p.state = p.charging
        ? "GATHERING"
        : owns
          ? "DRIBBLING"
          : p.defending
            ? "DEFENDING"
            : magnitude > 0.1
              ? active
                ? "SPRINTING"
                : "MOVING"
              : "IDLE";
  }
  updateHeldBall() {
    const b = this.ball;
    if (b.owner === null) return;
    const p = this.players[b.owner];
    const phase = p.phase % 1;
    const bounce = Math.abs(Math.cos(phase * Math.PI));
    const moving = p.moveTime > 0;
    const moveProgress = clamp(1-p.moveTime/(p.moveDuration || .7),0,1);
    const hand = p.hand * (moving && MOVES[p.moveKind]?.switchHand ? -Math.cos(moveProgress*Math.PI) : 1);
    b.x = p.x + Math.cos(p.angle) * hand * 0.43;
    b.z = p.z - Math.sin(p.angle) * hand * 0.43 + 0.05;
    b.y = p.charging ? 1.45 + Math.min(1,p.charge/.53)*.45 + p.y : p.gather ? 1.15+p.y : 0.12 + bounce * (p.post ? .65 : .9) + p.y;
    if (moving && !p.charging && !p.gather) {
      const arc = Math.sin(moveProgress*Math.PI);
      if (p.moveKind === 'behind') {
        b.x -= Math.sin(p.angle)*arc*.38; b.z -= Math.cos(p.angle)*arc*.38;
      } else if (p.moveKind === 'between') b.y = .12 + Math.abs(Math.cos(moveProgress*Math.PI))*.72;
      else if (p.moveKind === 'inout') {
        b.x -= Math.cos(p.angle)*p.hand*arc*.35;
        b.z += Math.sin(p.angle)*p.hand*arc*.35;
      }
    }
    if (p.charging) {
      const style = p.shotPlan || this.shotType(p, {});
      const release = releasePoint(p, style);
      const t = clamp(p.charge/shotTiming(p.shotPlan || ''),0,1);
      b.x += (release.x-b.x)*t; b.z += (release.z-b.z)*t; b.y += (release.y-b.y)*t;
      if (style.includes('WINDMILL')) {
        const swing = t*Math.PI*2;
        b.x = p.x+Math.cos(p.angle)*p.hand*(.12+.5*Math.sin(swing))+Math.sin(p.angle)*.1;
        b.y = p.y+1.43+.55*Math.cos(swing);
        b.z = p.z-Math.sin(p.angle)*p.hand*(.12+.5*Math.sin(swing))+Math.cos(p.angle)*.1;
      } else if (style.includes('TOMAHAWK')) {
        b.z += Math.sin(t*Math.PI)*.55;
        b.y += Math.sin(t*Math.PI)*.25;
      } else if (style.includes('JELLY')) {
        b.x += p.hand*Math.sin(t*Math.PI)*.3;
        b.y += Math.sin(t*Math.PI)*.35;
      }
    }
    b.hand = p.hand;
    b.phase = phase;
    b.vx = p.vx;
    b.vz = p.vz;
    b.vy = 0;
  }
  resolvePlayers() {
    if (this.mode === "practice") return;
    for (let i = 0; i < this.players.length; i++) for (let j = i+1; j < this.players.length; j++) {
    const a = this.players[i], b = this.players[j];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d = length(dx, dz),
      min = C.playerRadius * 2 + 0.08;
    if (d < min) {
      const nx = d > 0.001 ? dx / d : 1,
        nz = d > 0.001 ? dz / d : 0,
        overlap = min - d;
      const mass = p => (p.attributes?.strength || 75)*(p.screen ? 8 : p.post ? 2.5 : 1);
      const weightA = mass(b)/(mass(a)+mass(b));
      a.x -= nx * overlap * weightA;
      a.z -= nz * overlap * weightA;
      b.x += nx * overlap * (1-weightA);
      b.z += nz * overlap * (1-weightA);
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing > 0) {
        a.vx -= nx * closing * 0.52;
        a.vz -= nz * closing * 0.52;
        b.vx += nx * closing * 0.52;
        b.vz += nz * closing * 0.52;
      }
    }
    }
    for (const p of this.players) {
      p.x = clamp(p.x,-7.3,7.3); p.z = clamp(p.z,C.baseline+.2,13.8);
      this.resolveBackboard(p);
    }
  }
  outsideCourt(p) {
    return Math.abs(p.x)>C.courtWidth/2 || p.z<C.baseline || p.z>C.courtLength;
  }
  resolveBackboard(p, previousZ = p.z) {
    if (p.y+1.9 < C.board.bottom || p.y > C.board.top || Math.abs(p.x) > C.board.halfWidth+C.playerRadius) return;
    const side = previousZ >= C.board.z ? 1 : -1;
    const face = C.board.z+side*(C.playerRadius+.05);
    if ((p.z-C.board.z)*side < C.playerRadius+.05) {
      p.z = face;
      if (p.vz*side < 0) p.vz = 0;
    }
  }
  recordMiss() {
    const b = this.ball;
    if (!b.shotPending) return;
    b.shotPending = false;
    if (!b.scored) this.emit("miss", { player: b.shooter });
  }
  protectedShot() {
    const b = this.ball;
    if (!b.shotPending || b.scored || b.passing || b.y < C.hoop.y) return false;
    // The basket cylinder remains protected, including after rim contact.
    if (length(b.x, b.z-C.hoop.z) < C.rimRadius + C.ballRadius) return true;
    if (b.rimTouched || (!b.boardTouched && b.vy >= 0) || b.y-C.ballRadius < C.hoop.y) return false;
    const t = (b.vy + Math.sqrt(b.vy*b.vy + 2*C.gravity*(b.y-C.hoop.y)))/C.gravity;
    return length(b.x+b.vx*t, b.z+b.vz*t-C.hoop.z) < C.rimRadius+C.ballRadius+.15;
  }
  illegalTouch(p) {
    if (!this.protectedShot()) return false;
    if (this.team(p.id) !== this.team(this.ball.shooter)) this.awardBasket('GOALTENDING');
    else {
      this.ball.shotPending = false;
      this.check(this.otherTeam(p.id), 'BASKET INTERFERENCE');
    }
    return true;
  }
  awardBasket(reason = null) {
    const b = this.ball;
    if (b.scored || this.state === States.SCORE) return;
    b.shotPending = false;
    if (this.needsClear) { this.check(this.otherTeam(b.shooter), 'CLEAR'); return; }
    b.scored = true;
    const id = b.shooter, team = this.team(id);
    this.score[team] += b.points;
    this.stats[id].made++;
    if (b.assistFrom != null && b.assistFrom !== id && this.team(b.assistFrom) === team && this.time-(b.passTime || 0) < 5) this.stats[b.assistFrom].assists++;
    this.emit('score', { player: id, points: b.points, swish: !b.rimTouched, shotType: b.shotType, distance: b.shotDistance });
    if (reason) this.emit('message', { text: reason });
    this.state = States.SCORE; this.timer = 1.9;
    this.checkOwner = this.mode === 'practice' ? 0 : this.otherTeam(id);
    if (this.mode !== 'practice' && this.score[team] >= this.options.winScore && this.score[team]-this.score[1-team] >= 2) {
      this.winner = team; this.timer = 2.5;
    }
  }
  ballPhysics(dt) {
    const b = this.ball;
    const prev = { x: b.x, y: b.y, z: b.z };
    b.age += dt;
    b.vy -= C.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    // Swept backboard plane collision, with a small horizontal target box.
    if (
      Math.abs(b.x) < C.board.halfWidth+C.ballRadius &&
      b.y > C.board.bottom-C.ballRadius &&
      b.y < C.board.top+C.ballRadius &&
      ((b.vz < 0 && prev.z > C.board.z+C.ballRadius && b.z <= C.board.z+C.ballRadius) ||
       (b.vz > 0 && prev.z < C.board.z-C.ballRadius && b.z >= C.board.z-C.ballRadius))
    ) {
      const side = b.vz < 0 ? 1 : -1;
      b.z = C.board.z+side*C.ballRadius;
      b.vz = -b.vz * 0.74;
      if (b.y > C.hoop.y) b.boardTouched = true;
      this.emit("board");
    }
    // A torus collision is the sphere's distance to the closest point on the rim circle.
    const dx = b.x - C.hoop.x,
      dz = b.z - C.hoop.z,
      rad = length(dx, dz);
    const rx = rad < 0.00001 ? C.rimRadius : (dx / rad) * C.rimRadius,
      rz = C.hoop.z + (rad < 0.00001 ? 0 : (dz / rad) * C.rimRadius);
    const nx = b.x - rx,
      ny = b.y - C.hoop.y,
      nz = b.z - rz,
      nd = Math.hypot(nx, ny, nz);
    const min = C.ballRadius + C.rimTube;
    if (nd < min) {
      const n = nd || 0.001;
      const dot = (b.vx * nx + b.vy * ny + b.vz * nz) / n;
      if (dot < 0) {
        b.vx -= (1.62 * dot * nx) / n;
        b.vy -= (1.62 * dot * ny) / n;
        b.vz -= (1.62 * dot * nz) / n;
        b.x += (nx / n) * (min - nd);
        b.y += (ny / n) * (min - nd);
        b.z += (nz / n) * (min - nd);
        if (!b.rimTouched) this.emit("rim");
        b.rimTouched = true;
        this.clock = Math.max(this.clock, C.offensiveClock);
      }
    }
    // Count only a downward center-plane crossing through the opening.
    if (!b.passing && !b.scored && prev.y > C.hoop.y && b.y <= C.hoop.y && b.vy < 0) {
      const f = (prev.y - C.hoop.y) / (prev.y - b.y);
      const cx = prev.x + (b.x - prev.x) * f,
        cz = prev.z + (b.z - prev.z) * f;
      if (length(cx, cz - C.hoop.z) < C.rimRadius - C.ballRadius * 0.45) {
        this.awardBasket();
        b.vx *= 0.35;
        b.vz *= 0.35;
      }
    }
    if (b.y < C.ballRadius) {
      this.recordMiss();
      b.y = C.ballRadius;
      if (Math.abs(b.vy) > 0.7) this.emit("bounce");
      b.vy = Math.abs(b.vy) * 0.69;
      b.vx *= 0.82;
      b.vz *= 0.82;
      if (b.vy < 0.35) b.vy = 0;
      if (this.state === States.SHOT) this.state = States.LOOSE;
    }
    if (this.state === States.SCORE || this.state === States.DEAD) return;
    if (this.outsideCourt(b)) {
      if (this.mode === "practice") this.check(0, "BALL BACK");
      else this.check(this.otherTeam(b.lastTouch), "OUT OF BOUNDS");
      return;
    }
    for (const p of this.players) {
      if (this.mode === "practice" && p.id === 1) continue;
      const d = length(b.x - p.x, b.z - p.z);
      const handY = 1.95 + p.y;
      if (
        !b.passing && (b.shotPending || this.state === States.SHOT) &&
        p.y > 0.15 &&
        p.blockCd > 0 &&
        b.age > 0.07 &&
        d < 0.66 &&
        Math.abs(b.y - handY) < 0.5 &&
        b.lastTouch !== p.id
      ) {
        if (this.illegalTouch(p)) return;
        if (this.team(p.id) === this.team(b.shooter)) continue;
        b.vx += (b.x - p.x) * 5;
        b.vy = -1.8;
        b.vz += 3.2;
        b.lastTouch = p.id;
        this.state = States.LOOSE;
        this.stats[p.id].blocks++;
        b.shotPending = false;
        this.emit("block", { player: p.id });
      }
      if (b.age > (b.passing ? .13 : .42) && d < (b.passing ? .82 : .67) && b.y < 1.65 + p.y && b.vy < 2.3 && (!b.passing || p.id !== b.passFrom)) {
        if (this.illegalTouch(p)) return;
        this.recordMiss();
        const previous = this.possession;
        Object.assign(b, { owner: p.id, lastTouch: p.id, scored: false });
        const isPass = b.passing;
        if (!isPass) this.stats[p.id].rebounds++;
        else if (this.team(p.id) !== this.team(b.passFrom)) this.stats[p.id].steals++;
        if (this.team(p.id) !== this.team(previous)) this.needsClear = this.mode !== 'practice';
        b.assistFrom = isPass && this.team(p.id) === this.team(b.passFrom) ? b.passFrom : null;
        b.passTime = this.time;
        b.passing = false;
        this.possession = p.id;
        p.charging = false;
        p.shotHeld = false;
        this.state = States.LIVE;
        if (this.team(p.id) !== this.team(previous)) this.clock = this.options.shotClock;
        this.emit(isPass ? 'catch' : 'rebound', { player: p.id, clear: this.needsClear });
        break;
      }
    }
    if (this.mode === "practice" && b.age > 5) this.check(0, "NEXT SHOT");
  }
  step(dt, inputs = [emptyInput(), emptyInput()], historical = null) {
    if (this.state === States.PAUSED || this.state === States.OVER) return;
    this.time += dt;
    if (this.state === States.DEAD || this.state === States.SCORE) {
      this.timer -= dt;
      this.ballPhysicsDead(dt);
      if (this.timer <= 0) {
        if (this.winner !== null) {
          this.state = States.OVER;
          this.emit("gameover", { winner: this.winner });
        } else this.setupCheck();
      }
      return;
    }
    if (this.state === States.CHECK) {
      this.timer -= dt;
      this.updateHeldBall();
      if (this.timer <= 0) {
        this.state = States.LIVE;
        this.emit("message", { text: "START" });
      }
      return;
    }
    this.clock -= dt;
    if (
      this.clock <= 0 &&
      this.mode !== "practice" &&
      this.ball.owner !== null
    ) {
      this.check(this.otherTeam(this.possession), "SHOT CLOCK VIOLATION");
      return;
    }
    for (let i = 0; i < this.players.length; i++) {
      if (this.mode === "practice" && i === 1) continue;
      const p = this.players[i],
        input = inputs[i] || emptyInput();
      this.movePlayer(p, input, dt);
      if (this.state === States.DEAD) return;
      if (this.ball.owner === i) {
        if (input.pass && !p.passHeld && !p.charging && !p.gather) this.pass(p, input);
        p.passHeld = !!input.pass;
        if (this.ball.owner !== i) continue;
        if (this.needsClear && this.isTwo(p)) {
          this.needsClear = false;
          this.emit("message", { text: "BALL CLEARED" });
        }
        // Gather, plant, takeoff and release share one timeline.
        if (p.gather) { p.shotHeld = input.shoot; continue; }
        if (input.shoot && !p.shotHeld && !p.charging && p.recover <= 0) {
          p.shotPlan = this.shotType(p, input);
          p.charging = true;
          p.charge = 0;
          p.tookOff = false;
          p.shotOrigin = null;
        }
        if (p.charging) {
          p.charge += dt;
          if (p.shotPlan?.includes('DUNK') && p.charge > 0.15 && !p.tookOff) {
            p.vy = 5.7;
            p.shotOrigin = {x:p.x,z:p.z};
            p.tookOff = true;
            p.state = "DUNK";
          }
          const takeoffTime = p.shotPlan === 'FADEAWAY' ? .18 : .3;
          if (!p.shotPlan?.includes('DUNK') && p.charge > takeoffTime && !p.tookOff && p.y === 0) {
            p.vy = p.shotPlan?.includes('LAYUP') ? 3.8 : 3.4;
            p.shotOrigin = {x:p.x,z:p.z};
            p.tookOff = true;
            if (p.shotPlan === 'FADEAWAY') {
              const d=this.distance(p) || 1;
              p.vx=p.x/d*1.8; p.vz=(p.z-C.hoop.z)/d*1.8;
            }
          }
          if (!input.shoot || p.charge >= C.shotMax + 0.12)
            this.release(p, input, historical);
        }
        p.shotHeld = input.shoot;
      } else {
        p.charging = false;
        p.shotHeld = input.shoot;
      }
    }
    this.resolvePlayers();
    if (this.ball.owner !== null) this.updateHeldBall();
    else this.ballPhysics(dt);
  }
  pass(p, input) {
    if (this.players.length < 3 || p.passCd > 0) return;
    const mates = this.players.filter(q => q.id !== p.id && q.team === p.team);
    const aim = length(input.x, input.z);
    mates.sort((a,b) => {
      const rank = q => {
        const d = length(q.x-p.x,q.z-p.z) || 1;
        return aim > .2 ? ((q.x-p.x)*input.x+(q.z-p.z)*input.z)/d : -this.contest(q.id)-d*.01;
      };
      return rank(b)-rank(a);
    });
    const q = mates[0];
    if (!q) return;
    const t = clamp(length(q.x-p.x,q.z-p.z)/13,.22,.65);
    Object.assign(this.ball, { owner: null, x: p.x, y: 1.35, z: p.z,
      vx: (q.x+q.vx*t*.5-p.x)/t, vz: (q.z+q.vz*t*.5-p.z)/t, vy: C.gravity*t/2,
      age: 0, passing: true, passFrom: p.id, passTarget: q.id, lastTouch: p.id,
      scored: false, shotPending: false, assistFrom: null });
    p.passCd = .6; p.state = 'PASSING'; p.animation = .4;
    this.state = States.LOOSE;
    this.emit('pass', { player: p.id, target: q.id });
  }
  ballPhysicsDead(dt) {
    if (this.state === States.SCORE) {
      const b = this.ball;
      b.vy -= C.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y < 0.12) {
        b.y = 0.12;
        b.vy = Math.abs(b.vy) * 0.5;
      }
    }
  }
  snapshot() {
    return JSON.parse(
      JSON.stringify({
        mode: this.mode,
        options: this.options,
        players: this.players,
        ball: this.ball,
        score: this.score,
        stats: this.stats,
        state: this.state,
        timer: this.timer,
        clock: this.clock,
        time: this.time,
        eventId: this.eventId,
        events: this.events,
        feedback: this.feedback,
        winner: this.winner,
        needsClear: this.needsClear,
        checkOwner: this.checkOwner,
        possession: this.possession,
        lastShot: this.lastShot,
      }),
    );
  }
  restore(s) {
    Object.assign(this, s);
  }
}
