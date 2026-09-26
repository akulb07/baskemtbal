import { C, clamp, length, attributes, emptyInput, States } from "./config.js";

export class Player {
  constructor(id) {
    Object.assign(this, {
      id,
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
    this.players = [new Player(0), new Player(1)];
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
      rimTouched: false,
    };
    this.score = [0, 0];
    this.stats = [this.newStats(), this.newStats()];
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
    };
  }
  emit(type, data = {}) {
    this.events.push({ id: ++this.eventId, type, time: this.time, ...data });
    if (this.events.length > 32) this.events.shift();
  }
  check(owner, message = "CHECK BALL") {
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
      p.vx = p.vz = p.y = p.vy = 0;
      p.charging = false;
      p.charge = 0;
      p.shotHeld = false;
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
      rimTouched: false,
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
  isTwo(p) {
    return this.distance(p) >= 6.75 || (Math.abs(p.x) > 6.6 && p.z < 3);
  }
  contest(id, positions = this.players) {
    if (this.mode === "practice") return 0;
    positions ??= this.players;
    const p = positions[id],
      d = positions[1 - id];
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
  }
  lane(id) {
    const p = this.players[id],
      d = this.players[1 - id];
    const hx = -p.x,
      hz = C.hoop.z - p.z,
      l = length(hx, hz) || 1;
    const proj = ((d.x - p.x) * hx + (d.z - p.z) * hz) / l;
    const perp = Math.abs((d.x - p.x) * hz - (d.z - p.z) * hx) / l;
    return this.mode === "practice" || proj < 0 || proj > l || perp > 1.2
      ? "OPEN"
      : perp < 0.6
        ? "CUT OFF"
        : "CONTESTED";
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
    if ((p.shotPlan === "DUNK" && p.charging) || this.canDunk(p)) return "DUNK";
    if (dist < 2.1) return p.z < C.hoop.z ? "REVERSE LAYUP" : "LAYUP";
    if (dist < 3.3 && speed > 1.5) return "FLOATER";
    if (input.bank) return "BANK SHOT";
    if (p.moveKind === "stepback" && p.moveTime > 0) return "STEPBACK";
    if (p.vz > 1.2) return "FADEAWAY";
    return speed > 1 ? "PULL-UP" : "JUMP SHOT";
  }
  release(p, input, positions) {
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
    if (type === "DUNK" && (p.y < 1.05 || dist > 2.5 || contest > 0.65))
      type = "LAYUP";
    const ideal =
      type.includes("LAYUP") || type === "DUNK" ? 0.53 : C.perfectTime;
    const timing = duration - ideal;
    const window =
      C.perfectWindow * (1 - 0.35 * contest) * (p.stamina < 25 ? 0.8 : 1);
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
    const start = { x: p.x, y: 1.98 + p.y, z: p.z - 0.1 };
    let tx = 0,
      tz = C.hoop.z;
    const error =
      perfect && contest < 0.18 && dist < 7.5 ? 0 : (1 - quality) * 0.82;
    const direction =
      (p.id ? -0.7 : 0.7) + Math.sin(this.stats[p.id].attempts * 2.4) * 0.55;
    tx += error * direction;
    tz += error * (timing < 0 ? 1 : -1) * 1.05;
    let targetY = C.hoop.y;
    let apex = Math.max(start.y + 0.9, 4.4 + dist * 0.14);
    if (type === "DUNK") {
      apex = Math.max(start.y + 0.08, 3.6);
      tx = p.x * 0.035 + error * 0.22;
      tz = C.hoop.z + error * (timing < 0 ? 0.5 : -0.5);
    } else if (type.includes("LAYUP")) apex = Math.max(start.y + 0.2, 3.9);
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
      points: this.isTwo(p) ? 2 : 1,
      age: 0,
      scored: false,
      rimTouched: false,
    });
    this.stats[p.id].attempts++;
    if (perfect) this.stats[p.id].perfect++;
    this.state = States.SHOT;
    p.state =
      type === "DUNK" ? "DUNK" : type.includes("LAYUP") ? "LAYUP" : "SHOOTING";
    p.animation = 0.65;
    if (type !== "DUNK") p.vy = 3.5;
    p.stamina = clamp(p.stamina - (type === "DUNK" ? 10 : 5), 0, 100);
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
    p.stealCd = Math.max(0, p.stealCd - dt);
    p.blockCd = Math.max(0, p.blockCd - dt);
    p.recover = Math.max(0, p.recover - dt);
    p.moveTime = Math.max(0, p.moveTime - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.animation = Math.max(0, p.animation - dt);
    const owns = this.ball.owner === p.id;
    p.defending = !!input.defend && !owns;
    const magnitude = Math.min(1, length(input.x, input.z)),
      norm = length(input.x, input.z) || 1;
    let speed =
      (input.sprint ? C.sprintSpeed : C.speed) *
      (p.stamina < 15 ? 0.78 : 1) *
      (p.defending ? 0.72 : 1) *
      (p.charging ? 0.32 : 1) *
      (p.recover > 0 ? 0.4 : 1);
    const accel = C.acceleration * (p.stamina < 15 ? 0.8 : 1);
    const approach = (v, t, a) => v + clamp(t - v, -a * dt, a * dt);
    p.vx = approach(
      p.vx,
      (input.x / norm) * magnitude * speed,
      magnitude ? accel : C.deceleration,
    );
    p.vz = approach(
      p.vz,
      (input.z / norm) * magnitude * speed,
      magnitude ? accel : C.deceleration,
    );
    if (owns && input.move && p.cooldown <= 0 && p.stamina > 8) {
      const move = input.move;
      p.moveKind = move;
      p.moveTime = 0.7;
      p.cooldown = move === "spin" ? 0.55 : 0.34;
      p.hand *= -1;
      p.stamina -= move === "stepback" ? 8 : 5;
      const toward = length(p.x, p.z - C.hoop.z) || 1;
      if (move === "stepback" || move === "retreat") {
        p.vx += (p.x / toward) * 3;
        p.vz += ((p.z - C.hoop.z) / toward) * 3;
      } else if (move === "spin") {
        p.vx += p.hand * 2.4;
        p.vz -= 1.5;
      } else if (move === "hesitation") {
        p.vx *= 0.4;
        p.vz *= 0.4;
      } else {
        p.vx += (input.x || p.hand) * 2.6;
        p.vz -= 0.3;
      }
      p.state = "DRIBBLE_MOVE";
      this.emit("move", { player: p.id, move });
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const wasOut = Math.abs(p.x) > 7.5 || p.z < 0 || p.z > 14;
    if (wasOut && owns && this.mode !== "practice") {
      this.check(1 - p.id, "OUT OF BOUNDS");
      return;
    }
    p.x = clamp(p.x, -7.3, 7.3);
    p.z = clamp(p.z, 0.2, 13.8);
    p.y += p.vy * dt;
    p.vy -= C.gravity * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
    }
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
    if (magnitude > 0.1 && !p.defending) p.angle = Math.atan2(p.vx, p.vz);
    else p.angle = Math.atan2(-p.x, C.hoop.z - p.z);
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
    const hand =
      p.hand * (moving ? Math.cos((0.7 - p.moveTime) * Math.PI * 3) : 1);
    b.x = p.x + Math.cos(p.angle) * hand * 0.43;
    b.z = p.z - Math.sin(p.angle) * hand * 0.43 + 0.05;
    b.y = p.charging ? 1.75 + p.y : 0.12 + bounce * 0.9 + p.y;
    b.hand = p.hand;
    b.phase = phase;
    b.vx = p.vx;
    b.vz = p.vz;
    b.vy = 0;
  }
  resolvePlayers() {
    if (this.mode === "practice") return;
    const [a, b] = this.players;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d = length(dx, dz),
      min = C.playerRadius * 2 + 0.08;
    if (d < min) {
      const nx = d > 0.001 ? dx / d : 1,
        nz = d > 0.001 ? dz / d : 0,
        overlap = (min - d) / 2;
      a.x -= nx * overlap;
      a.z -= nz * overlap;
      b.x += nx * overlap;
      b.z += nz * overlap;
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing > 0) {
        a.vx -= nx * closing * 0.52;
        a.vz -= nz * closing * 0.52;
        b.vx += nx * closing * 0.52;
        b.vz += nz * closing * 0.52;
      }
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
      Math.abs(b.x) < 1.02 &&
      b.y > 2.78 &&
      b.y < 4.03 &&
      b.vz < 0 &&
      prev.z > 1.2 &&
      b.z <= 1.2
    ) {
      b.z = 1.2;
      b.vz = Math.abs(b.vz) * 0.74;
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
    if (!b.scored && prev.y > C.hoop.y && b.y <= C.hoop.y && b.vy < 0) {
      const f = (prev.y - C.hoop.y) / (prev.y - b.y);
      const cx = prev.x + (b.x - prev.x) * f,
        cz = prev.z + (b.z - prev.z) * f;
      if (length(cx, cz - C.hoop.z) < C.rimRadius - C.ballRadius * 0.45) {
        b.scored = true;
        if (!this.needsClear) {
          const id = b.shooter;
          this.score[id] += b.points;
          this.stats[id].made++;
          this.emit("score", {
            player: id,
            points: b.points,
            swish: !b.rimTouched,
          });
          this.state = States.SCORE;
          this.timer = 1.9;
          this.checkOwner = this.mode === "practice" ? 0 : 1 - id;
          if (
            this.mode !== "practice" &&
            this.score[id] >= this.options.winScore &&
            this.score[id] - this.score[1 - id] >= 2
          ) {
            this.winner = id;
            this.timer = 2.5;
          }
        } else {
          this.check(1 - b.shooter, "CLEAR THE BALL FIRST");
        }
        b.vx *= 0.35;
        b.vz *= 0.35;
      }
    }
    if (b.y < C.ballRadius) {
      b.y = C.ballRadius;
      if (Math.abs(b.vy) > 0.7) this.emit("bounce");
      b.vy = Math.abs(b.vy) * 0.69;
      b.vx *= 0.82;
      b.vz *= 0.82;
      if (b.vy < 0.35) b.vy = 0;
      if (this.state === States.SHOT) this.state = States.LOOSE;
    }
    if (this.state === States.SCORE) return;
    if (Math.abs(b.x) > 7.8 || b.z < -0.4 || b.z > 14.4) {
      if (this.mode === "practice") this.check(0, "BALL BACK");
      else this.check(1 - b.lastTouch, "OUT OF BOUNDS");
      return;
    }
    for (const p of this.players) {
      if (this.mode === "practice" && p.id === 1) continue;
      const d = length(b.x - p.x, b.z - p.z);
      const handY = 1.95 + p.y;
      if (
        p.id !== b.shooter &&
        p.y > 0.15 &&
        p.blockCd > 0 &&
        b.age > 0.07 &&
        d < 0.66 &&
        Math.abs(b.y - handY) < 0.5 &&
        b.lastTouch !== p.id
      ) {
        b.vx += (b.x - p.x) * 5;
        b.vy = -1.8;
        b.vz += 3.2;
        b.lastTouch = p.id;
        this.state = States.LOOSE;
        this.stats[p.id].blocks++;
        this.emit("block", { player: p.id });
      }
      if (b.age > 0.42 && d < 0.67 && b.y < 1.5 + p.y && b.vy < 2.3) {
        const previous = this.possession;
        Object.assign(b, { owner: p.id, lastTouch: p.id, scored: false });
        this.stats[p.id].rebounds++;
        this.needsClear = p.id !== previous && this.mode !== "practice";
        this.possession = p.id;
        p.charging = false;
        p.shotHeld = false;
        this.state = States.LIVE;
        if (p.id !== previous) this.clock = this.options.shotClock;
        this.emit("rebound", { player: p.id, clear: this.needsClear });
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
        this.emit("message", { text: "BALL IN" });
      }
      return;
    }
    this.clock -= dt;
    if (
      this.clock <= 0 &&
      this.mode !== "practice" &&
      this.ball.owner !== null
    ) {
      this.check(1 - this.possession, "SHOT CLOCK VIOLATION");
      return;
    }
    for (let i = 0; i < 2; i++) {
      if (this.mode === "practice" && i === 1) continue;
      const p = this.players[i],
        input = inputs[i] || emptyInput();
      this.movePlayer(p, input, dt);
      if (this.state === States.DEAD) return;
      if (this.ball.owner === i) {
        if (this.needsClear && this.isTwo(p)) {
          this.needsClear = false;
          this.emit("message", { text: "BALL CLEARED" });
        }
        if (input.shoot && !p.shotHeld && !p.charging && p.recover <= 0) {
          p.shotPlan = this.canDunk(p) ? "DUNK" : null;
          p.charging = true;
          p.charge = 0;
          p.tookOff = false;
        }
        if (p.charging) {
          p.charge += dt;
          if (p.shotPlan === "DUNK" && p.charge > 0.15 && !p.tookOff) {
            p.vy = 5.7;
            p.tookOff = true;
            p.state = "DUNK";
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
