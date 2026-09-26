export class AudioManager {
  constructor() {
    this.volume = 0.45;
    this.enabled = true;
    this.ctx = null;
    this.lastBounce = 0;
  }
  unlock() {
    try {
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch {}
  }
  tone(freq, duration = 0.12, type = "sine", gain = 0.15, slide = 0) {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime,
        o = this.ctx.createOscillator(),
        g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      if (slide)
        o.frequency.exponentialRampToValueAtTime(slide, now + duration);
      g.gain.setValueAtTime(gain * this.volume, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(now);
      o.stop(now + duration);
    } catch {}
  }
  play(type) {
    if (type === "bounce") {
      const now = performance.now();
      if (now - this.lastBounce < 130) return;
      this.lastBounce = now;
      this.tone(130, 0.1, "sine", 0.3, 45);
    } else if (type === "score") {
      this.tone(520, 0.2, "sine", 0.2);
      setTimeout(() => this.tone(780, 0.25, "sine", 0.15), 90);
    } else if (type === "rim" || type === "board")
      this.tone(type === "rim" ? 310 : 180, 0.16, "triangle", 0.2, 120);
    else if (type === "block" || type === "steal")
      this.tone(220, 0.12, "triangle", 0.2, 90);
    else if (type === "perfect") this.tone(900, 0.22, "sine", 0.1, 1500);
    else if (type === "buzzer") this.tone(120, 0.5, "sawtooth", 0.1);
    else this.tone(400, 0.04, "sine", 0.1);
  }
}
