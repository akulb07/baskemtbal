import { C, emptyInput, clamp, length } from "./config.js";
import { shotTiming } from './moves.js';
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
      other = g.opponent(this.id),
      b = g.ball;
    let result = { ...this.cached, move: null, steal: false, block: false, pass: false };
    if (g.time >= this.next) {
      this.next = g.time + this.tuning.reaction;
      result = emptyInput();
      let tx = p.x,
        tz = p.z;
      let passTo = null;
      if (g.mode === 'team' && b.passing && b.passTarget === this.id) {
        tx = b.x + b.vx * .2; tz = b.z + b.vz * .2;
        this.state = 'CATCH';
      } else if (b.owner === null) {
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
        if (length(b.x - p.x, b.z - p.z) < 1.1 && b.y > 1.8 && b.y < 3.1 &&
            (!b.shotPending || (g.team(b.shooter) !== p.team && b.vy > 0 && !b.boardTouched && !g.protectedShot())))
          result.block = true;
      } else if (g.mode === 'team' && g.team(b.owner) === g.team(this.id) && b.owner !== this.id) {
        const carrier = g.players[b.owner];
        const wings = g.players.filter(q => q.team === p.team && q.id !== b.owner);
        const side = wings[0].id === this.id ? -1 : 1;
        const cut = Math.sin(g.time*.5 + this.id) > .8 && g.distance(carrier) > 4;
        tx = cut ? side*1.2 : side*5.2;
        tz = cut ? 2.8 : 5.5 + Math.sin(g.time*.35+this.id);
        this.state = cut ? 'CUT' : 'SPACE';
        const screen = this.id >= 4 && g.distance(carrier) > 4 && Math.sin(g.time*.3) > .5;
        if (screen) {
          const defender = g.opponent(carrier.id);
          tx = defender.x + side*.65; tz = defender.z;
          result.screen = length(tx-p.x,tz-p.z) < .45;
          this.state = 'SCREEN';
        }
      } else if (b.owner !== this.id) {
        // Pick up the ball first, then assign the remaining matchups once.
        let mark = g.opponent(this.id);
        if (g.mode === 'team') {
          const carrier = g.players[b.owner];
          const available = g.players.filter(q => q.team === p.team);
          const offense = [carrier,...g.players.filter(q => q.team !== p.team && q.id !== carrier.id)];
          for (const target of offense) {
            available.sort((a,c) => length(a.x-target.x,a.z-target.z)-length(c.x-target.x,c.z-target.z));
            const defender = available.shift();
            if (defender.id === this.id) { mark = target; break; }
          }
        }
        const other = mark;
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
        if (g.mode === 'team' && !p.charging && p.passCd <= 0 && contest > .18 && g.clock < 22) {
          const safeLane = q => g.opponents(p.id).every(d => {
            const dx=q.x-p.x, dz=q.z-p.z;
            const t=clamp(((d.x-p.x)*dx+(d.z-p.z)*dz)/(dx*dx+dz*dz || 1),0,1);
            return length(d.x-p.x-dx*t,d.z-p.z-dz*t) > .95;
          });
          const mate = g.players.filter(q => q.team === p.team && q.id !== p.id && safeLane(q))
            .sort((a,b) => g.contest(a.id)-g.contest(b.id))[0];
          if (mate && g.contest(mate.id) + .12 < contest) { result.pass = true; passTo = mate; }
        }
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
              shotTiming(g.shotType(p,result)) +
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
      if (result.pass) {
        result.shoot = false;
        const d=length(passTo.x-p.x,passTo.z-p.z) || 1;
        result.x=(passTo.x-p.x)/d; result.z=(passTo.z-p.z)/d;
      }
      this.cached = { ...result, move: null, steal: false, block: false, pass: false };
    }
    if (p.charging) {
      result.shoot = p.charge < this.targetCharge;
      result.x = result.z = 0;
    }
    return result;
  }
}
