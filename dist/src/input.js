import { emptyInput, clamp } from "./config.js";
import { FINISHES, MOVES } from './moves.js';
export const DEFAULT_KEYS = [
  {
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    sprint: "ShiftLeft",
    shoot: "Space",
    move: "KeyQ",
    cross: "KeyC",
    step: "KeyX",
    steal: "KeyE",
    defend: "KeyF",
    bank: "KeyB",
    post: 'KeyZ', euro: 'KeyV', pinoy: 'KeyN', hop: 'KeyH',
    pass: 'KeyR', switchPlayer: 'KeyT', screen: 'KeyG', finishCycle: 'KeyL', moveCycle: 'KeyK',
  },
];
export class InputManager {
  constructor(onPause) {
    this.keys = new Set();
    this.pressed = new Set();
    this.bindings = structuredClone(DEFAULT_KEYS);
    this.touch = emptyInput();
    this.touchEdges = {};
    this.enabled = false;
    this.moveIndex = 0;
    this.selectedMove = 'between';
    this.selectedFinish = 'auto';
    this.onPause = onPause;
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape" || e.key === "Escape") {
        // Prevent the same key from immediately dismissing the dialog it opens.
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) onPause();
        return;
      }
      if (
        !this.enabled ||
        /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)
      )
        return;
      if (this.bindings.some((b) => Object.values(b).includes(e.code)))
        e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clear();
        if (this.enabled) onPause(true);
      }
    });
    this.bindTouch();
  }
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.touch = emptyInput();
    this.touchEdges = {};
    document.querySelector("#joystick i").style.transform = "";
  }
  sample(id) {
    const k = this.bindings[id],
      held = (a) => this.keys.has(k[a]),
      edge = (a) => this.pressed.has(k[a]);
    const input = emptyInput();
    input.x = Number(held("right")) - Number(held("left"));
    input.z = Number(held("down")) - Number(held("up"));
    input.shoot = held("shoot");
    input.sprint = held("sprint");
    input.defend = held("defend");
    input.block = edge("defend");
    input.steal = edge("steal");
    input.bank = held("bank");
    input.post = held('post');
    input.pass = edge('pass');
    input.switchPlayer = edge('switchPlayer');
    input.screen = held('screen');
    if (edge('finishCycle')) this.selectedFinish = FINISHES[(FINISHES.indexOf(this.selectedFinish)+1)%FINISHES.length];
    if (edge('moveCycle')) {
      const moves = Object.keys(MOVES);
      this.selectedMove = moves[(moves.indexOf(this.selectedMove)+1)%moves.length];
    }
    input.finish = this.selectedFinish || 'auto';
    if (edge("cross")) input.move = "crossover";
    if (edge("step")) input.move = "stepback";
    if (edge("move"))
      input.move = this.selectedMove || 'between';
    for (const action of ['euro','pinoy','hop']) if (edge(action)) input.move = action;
    if (id === 0) {
      input.x = clamp(input.x + this.touch.x, -1, 1);
      input.z = clamp(input.z + this.touch.z, -1, 1);
      for (const key of ["shoot", "sprint", "defend", 'post', 'screen'])
        input[key] ||= this.touch[key];
      input.move = this.touchEdges.move || input.move;
      input.steal ||= this.touchEdges.steal;
      input.block ||= this.touchEdges.block;
      input.pass ||= this.touchEdges.pass;
      input.switchPlayer ||= this.touchEdges.switchPlayer;
      this.touchEdges = {};
    }
    for (const code of Object.values(k)) this.pressed.delete(code);
    return input;
  }
  bindTouch() {
    const joy = document.querySelector("#joystick"),
      stick = joy.firstElementChild;
    let pointer = null,
      origin = null;
    const move = (e) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - origin.x,
        dy = e.clientY - origin.y,
        l = Math.hypot(dx, dy),
        r = 42;
      const factor = Math.min(1, l / r) / (l || 1);
      this.touch.x = l < 8 ? 0 : dx * factor;
      this.touch.z = l < 8 ? 0 : dy * factor;
      stick.style.transform = `translate(${dx * factor * r}px,${dy * factor * r}px)`;
    };
    joy.addEventListener("pointerdown", (e) => {
      if (!this.enabled || pointer !== null) return;
      e.preventDefault();
      pointer = e.pointerId;
      const r = joy.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      joy.setPointerCapture(pointer);
      move(e);
    });
    joy.addEventListener("pointermove", move);
    const end = () => {
      pointer = null;
      this.touch.x = this.touch.z = 0;
      stick.style.transform = "";
    };
    joy.addEventListener("pointerup", e => { if (e.pointerId === pointer) end(); });
    joy.addEventListener("pointercancel", e => { if (e.pointerId === pointer) end(); });
    let lastDrive = 0;
    for (const button of document.querySelectorAll("[data-action]")) {
      let start = null;
      button.addEventListener("pointerdown", (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        start = { x: e.clientX, y: e.clientY, time: performance.now() };
        const a = button.dataset.action;
        if (a === "move") return;
        if (a === 'pass' || a === 'switchPlayer') { this.touchEdges[a] = true; return; }
        this.touch[a] = true;
        if (a === "defend") {
          this.touchEdges.steal = true;
          this.touchEdges.block = true;
        }
        if (a === "shoot" && button.textContent === "BLOCK")
          this.touchEdges.block = true;
        if (a === "sprint") {
          if (performance.now() - lastDrive < 300)
            this.touchEdges.move = "inout";
          lastDrive = performance.now();
        }
      });
      button.addEventListener("pointerup", (e) => {
        const a = button.dataset.action;
        this.touch[a] = false;
        if (a === "move" && start) {
          const dx = e.clientX - start.x,
            dy = e.clientY - start.y;
          if (dy > 24) this.touchEdges.move = "stepback";
          else if (dy < -24) this.touchEdges.move = "spin";
          else if (Math.abs(dx) > 24)
            this.touchEdges.move = dx < 0 ? "behind" : "between";
          else this.touchEdges.move = this.selectedMove;
        }
        start = null;
      });
      button.addEventListener("pointercancel", () => {
        this.touch[button.dataset.action] = false;
        start = null;
      });
      button.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }
}
