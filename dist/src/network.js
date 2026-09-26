import { C, emptyInput, clamp } from "./config.js";
export class SnapshotBuffer {
  constructor() {
    this.items = [];
  }
  push(message) {
    this.items.push({ ...message, received: performance.now() });
    if (this.items.length > 30) this.items.shift();
  }
  sample(delay = 100) {
    const target = performance.now() - delay;
    let a = this.items[0],
      b = a;
    for (const s of this.items) {
      if (s.received <= target) a = s;
      else {
        b = s;
        break;
      }
    }
    if (!a || !b) return null;
    return {
      a: a.state,
      b: b.state,
      t: clamp((target - a.received) / (b.received - a.received || 1), 0, 1),
    };
  }
}
export class NetworkManager {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.ws = null;
    this.seq = 0;
    this.pending = [];
    this.buffer = new SnapshotBuffer();
    this.ping = 0;
    this.jitter = 0;
    this.offset = 0;
    this.slot = 0;
    this.connected = false;
    this.intentional = false;
    this.lastSnapshot = 0;
    this.loss = 0;
    this.reconnecting = false;
    this.started = false;
  }
  connect(url, action, name, code) {
    this.disconnect();
    this.intentional = false;
    this.url = url;
    this.action = { type: action, name, code };
    this.token = null;
    this.seq = 0;
    this.pending = [];
    this.buffer = new SnapshotBuffer();
    this.started = false;
    this.open();
  }
  open(resume = false) {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.onMessage({
        type: "error",
        message: "Online rooms are unavailable. Try again later.",
      });
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this.reconnecting = false;
      this.send(
        resume
          ? { type: "resume", code: this.code, token: this.token }
          : this.action,
      );
      clearInterval(this.pinger);
      this.pinger = setInterval(
        () => this.send({ type: "ping", sent: Date.now() }),
        1500,
      );
    };
    this.ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.type === "joined") {
        this.slot = m.slot;
        this.code = m.code;
        this.token = m.token;
        this.send({ type: "ready" });
      }
      if (m.type === "start") {
        this.started = true;
        this.pending = [];
        this.buffer = new SnapshotBuffer();
      }
      if (m.type === "snapshot") {
        this.buffer.push(m);
        const gap = performance.now() - this.lastSnapshot;
        this.loss =
          gap > 100 ? Math.min(1, this.loss * 0.9 + 0.1) : this.loss * 0.95;
        this.lastSnapshot = performance.now();
      }
      if (m.type === "pong") {
        const rtt = Date.now() - m.sent;
        this.jitter = this.jitter * 0.8 + Math.abs(rtt - this.ping) * 0.2;
        this.ping = rtt;
        this.offset = m.time - (m.sent + rtt / 2);
      }
      this.onMessage(m);
    };
    this.ws.onerror = () =>
      this.onMessage({
        type: "error",
        message:
          "Couldn’t connect. Try again in a moment.",
      });
    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pinger);
      if (!this.intentional && this.token) {
        this.reconnecting = true;
        this.onMessage({ type: "reconnecting", seconds: 20 });
        this.retrySince ??= Date.now();
        if (Date.now() - this.retrySince < 20000)
          this.retry = setTimeout(() => this.open(true), 1400);
        else
          this.onMessage({
            type: "ended",
            message: "Connection lost. Return to the menu and try again.",
          });
      } else if (!this.intentional)
        this.onMessage({
          type: "error",
          message: "Connection closed. Try again.",
        });
    };
  }
  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(data));
  }
  submit(input) {
    if (!this.connected || !this.started) return;
    const seq = ++this.seq;
    const message = {
      type: "input",
      seq,
      timestamp: Date.now() + this.offset,
      input,
    };
    this.send(message);
    this.pending.push({ seq, input: { ...input } });
    if (this.pending.length > 120) this.pending.shift();
  }
  reconcile(game, m) {
    const ack = m.ack[this.slot];
    this.pending = this.pending.filter((p) => p.seq > ack);
    game.restore(m.state);
    for (const pending of this.pending) {
      const inputs = [emptyInput(), emptyInput()];
      inputs[this.slot] = pending.input;
      for (let i = 0; i < 4; i++) {
        game.step(C.dt, inputs);
        inputs[this.slot] = {
          ...inputs[this.slot],
          move: null,
          steal: false,
          block: false,
        };
      }
    }
  }
  renderState(game) {
    const sample = this.buffer.sample(clamp(85 + this.jitter * 2, 85, 180));
    if (!sample) return game;
    const remote = 1 - this.slot;
    const p = { ...game.players[remote] },
      a = sample.a.players[remote],
      b = sample.b.players[remote],
      t = sample.t;
    for (const k of ["x", "y", "z"]) p[k] = a[k] + (b[k] - a[k]) * t;
    const players = [...game.players];
    players[remote] = p;
    return { ...game, players };
  }
  disconnect() {
    this.intentional = true;
    clearTimeout(this.retry);
    clearInterval(this.pinger);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.connected = false;
    this.retrySince = null;
    this.token = null;
    this.started = false;
  }
}
