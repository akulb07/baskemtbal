import { C, emptyInput, clamp, length } from "./config.js";
const DIFFICULTY = {
  rookie: { reaction: 0.38, error: 0.17 },
  pro: { reaction: 0.23, error: 0.075 },
  allstar: { reaction: 0.15, error: 0.045 },
  elite: { reaction: 0.11, error: 0.025 },
};
export class AIInputController {
  constructor(id = 1, difficulty = "pro") {
    this.id = id;
    this.tuning = DIFFICULTY[difficulty] || DIFFICULTY.pro;
    this.next = 0;
    this.cached = emptyInput();
    this.targetCharge = 0.68;
    this.lastMove = 0;
    this.state = "DEFENSIVE_SETUP";
  }
  sample(g) {
    const p = g.players[this.id],
      other = g.players[1 - this.id],
      b = g.ball;
    let result = { ...this.cached, move: null, steal: false, block: false };
    if (g.time >= this.next) {
      this.next = g.time + this.tuning.reaction;
      result = emptyInput();
      let tx = p.x,
        tz = p.z;
      if (b.owner === null) {
        this.state = "REBOUND";
        const t = clamp(
          (b.vy +
            Math.sqrt(Math.max(0, b.vy * b.vy + 2 * C.gravity * (b.y - 0.6)))) /
            C.gravity,
          0,
          1.2,
        );
        tx = clamp(b.x + b.vx * t, -6.8, 6.8);
        tz = clamp(b.z + b.vz * t, 0.6, 13.2);
        result.sprint = true;
        if (length(b.x - p.x, b.z - p.z) < 1.1 && b.y > 1.8 && b.y < 3.1)
          result.block = true;
      } else if (b.owner !== this.id) {
        this.state = "ON_BALL_DEFENSE";
        const distance = g.distance(other) || 1;
        tx = other.x * (1 - 1.15 / distance) + other.vx * 0.1;
        tz =
          other.z + ((C.hoop.z - other.z) * 1.15) / distance + other.vz * 0.1;
        result.defend = true;
        result.sprint = length(tx - p.x, tz - p.z) > 2.3;
        if (
          other.charging &&
          other.charge > 0.37 &&
          length(other.x - p.x, other.z - p.z) < 1.6
        ) {
          result.block = true;
          this.state = "CONTEST";
        }
        if (
          length(b.x - p.x, b.z - p.z) < 0.9 &&
          b.y < 0.55 &&
          Math.sin(g.time * 2) > 0.6
        ) {
          result.steal = true;
          this.state = "STEAL_ATTEMPT";
        }
      } else {
        const dist = g.distance(p),
          contest = g.contest(this.id);
        this.state = "SIZE_UP";
        if (g.needsClear) {
          tx = p.x < 0 ? -3 : 3;
          tz = 9;
          this.state = "RESET";
        } else {
          const open = g.lane(this.id) === "OPEN";
          tx = Math.sin(g.time * 0.65) * 2.8;
          tz = dist > 4 ? 3.2 : 2.8;
          result.sprint = open && dist > 2.1;
          if (open) this.state = "DRIVE";
          if (g.time - this.lastMove > 1.15 && dist > 2.2 && contest > 0.1) {
            result.move = ["crossover", "hesitation", "behind", "stepback"][
              Math.floor(g.time * 1.7) % 4
            ];
            this.lastMove = g.time;
            this.state = "DRIBBLE_MOVE";
          }
          if (
            (contest < 0.33 && dist < 6.8 && g.time - this.lastMove > 0.45) ||
            dist < 1.7 ||
            g.clock < 4
          ) {
            result.shoot = true;
            this.targetCharge =
              (dist < 2.1 ? 0.53 : 0.68) +
              Math.sin(g.time * 3.1) * this.tuning.error;
            this.state = "SHOOT";
            tx = p.x;
            tz = p.z;
          }
        }
      }
      const dx = tx - p.x,
        dz = tz - p.z,
        l = length(dx, dz);
      result.x = l > 0.17 ? dx / (l || 1) : 0;
      result.z = l > 0.17 ? dz / (l || 1) : 0;
      this.cached = { ...result, move: null, steal: false, block: false };
    }
    if (p.charging) {
      result.shoot = p.charge < this.targetCharge;
      result.x = result.z = 0;
    }
    return result;
  }
}
