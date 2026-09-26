import { emptyInput, clamp } from "./config.js";
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
  },
  {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    sprint: "ShiftRight",
    shoot: "Enter",
    move: "Slash",
    cross: "Comma",
    step: "KeyM",
    steal: "Period",
    defend: "KeyL",
    bank: "KeyN",
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
    this.onPause = onPause;
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && !e.repeat) {
        onPause();
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
    if (edge("cross")) input.move = "crossover";
    if (edge("step")) input.move = "stepback";
    if (edge("move"))
      input.move = ["between", "behind", "hesitation", "spin", "inout"][
        this.moveIndex++ % 5
      ];
    if (id === 0) {
      input.x = clamp(input.x + this.touch.x, -1, 1);
      input.z = clamp(input.z + this.touch.z, -1, 1);
      for (const key of ["shoot", "sprint", "defend"])
        input[key] ||= this.touch[key];
      input.move = this.touchEdges.move || input.move;
      input.steal ||= this.touchEdges.steal;
      input.block ||= this.touchEdges.block;
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
    joy.addEventListener("pointerup", end);
    joy.addEventListener("pointercancel", end);
    let lastDrive = 0;
    for (const button of document.querySelectorAll("[data-action]")) {
      let start = null;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        start = { x: e.clientX, y: e.clientY, time: performance.now() };
        const a = button.dataset.action;
        if (a === "move") return;
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
          else this.touchEdges.move = "crossover";
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
