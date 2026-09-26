import * as T from "../vendor/three.module.js";
import { C, clamp } from "./config.js";
export class SceneManager {
  constructor(canvas) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#dba991");
    this.scene.fog = new T.FogExp2("#d7ad96", 0.019);
    this.camera = new T.PerspectiveCamera(43, 1, 0.1, 170);
    this.camera.position.set(15, 12, 22);
    this.look = new T.Vector3(-2, 0, 5);
    this.camera.lookAt(this.look);
    this.menu = true;
    this.quality = "auto";
    this.fps = 60;
    this.frameTotal = 0;
    this.frameCount = 0;
    this.dpr = Math.min(devicePixelRatio, 1.5);
    this.temp = new T.Vector3();
    this.materials = {};
    this.geometries = {};
    this.scene.add(new T.HemisphereLight(0xfce7cb, 0x4a6970, 2.2));
    this.sun = new T.DirectionalLight(0xffd0a1, 3.2);
    this.sun.position.set(-10, 16, -9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -18,
      right: 18,
      top: 18,
      bottom: -18,
      near: 0.1,
      far: 70,
    });
    this.sun.shadow.bias = -0.0003;
    this.scene.add(this.sun);
    this.createCourt();
    this.createEnvironment();
    this.characters = [
      this.createPlayer(0xe9974f, 0),
      this.createPlayer(0xa3d5d5, 1),
    ];
    this.ball = this.mesh(
      new T.SphereGeometry(0.12, 24, 16),
      this.mat(0xc66221),
    );
    this.ball.castShadow = true;
    this.ballSeams();
    this.shadow = this.mesh(
      new T.CircleGeometry(0.17, 20),
      new T.MeshBasicMaterial({
        color: 0x121e22,
        transparent: true,
        opacity: 0.25,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.ring = this.mesh(
      new T.RingGeometry(0.43, 0.46, 48),
      new T.MeshBasicMaterial({
        color: 0xffbd6b,
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.8,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  mat(color) {
    return (this.materials[color] ??= new T.MeshStandardMaterial({
      color,
      roughness: 0.85,
    }));
  }
  mesh(geo, mat, parent = this.scene) {
    const m = new T.Mesh(geo, mat);
    parent.add(m);
    return m;
  }
  box(x, y, z, w, h, d, color, parent = this.scene) {
    const key = `b${w},${h},${d}`;
    const m = this.mesh(
      (this.geometries[key] ??= new T.BoxGeometry(w, h, d)),
      this.mat(color),
      parent,
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  line(points, color = 0xe5dec2, parent = this.scene) {
    const geo = new T.BufferGeometry().setFromPoints(
      points.map((p) => new T.Vector3(...p)),
    );
    const l = new T.Line(
      geo,
      new T.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    parent.add(l);
    return l;
  }
  tube(a, b, r, color, parent = this.scene) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      dir = end.clone().sub(start);
    const m = this.mesh(
      new T.CylinderGeometry(r, r, dir.length(), 8),
      this.mat(color),
      parent,
    );
    m.position.copy(start.add(end).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    return m;
  }
  createCourt() {
    this.box(0, -0.15, 7, 18, 0.25, 17, 0x344c50);
    const canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 1400;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#607b78";
    ctx.fillRect(0, 0, 1500, 1400);
    const rnd = (() => {
      let s = 82;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })();
    for (let i = 0; i < 38000; i++) {
      ctx.fillStyle = rnd() > 0.5 ? "#ffffff09" : "#0000000b";
      ctx.fillRect(rnd() * 1500, rnd() * 1400, 2, 2);
    }
    const x = (v) => (v + 7.5) * 100,
      z = (v) => v * 100;
    ctx.fillStyle = "#c68b68";
    ctx.fillRect(x(-2.45), z(0), 490, 580);
    ctx.fillStyle = "#c69575";
    ctx.beginPath();
    ctx.arc(x(0), z(5.8), 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c68b68";
    ctx.fillRect(x(-2.45), 0, 490, 580);
    ctx.strokeStyle = "#f1e5c7";
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 1484, 1384);
    ctx.strokeRect(x(-2.45), 0, 490, 580);
    ctx.beginPath();
    ctx.arc(x(0), z(5.8), 180, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([14, 15]);
    ctx.beginPath();
    ctx.arc(x(0), z(5.8), 180, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x(6.6), 0);
    ctx.lineTo(x(6.6), z(2.865));
    ctx.arc(
      x(0),
      z(1.45),
      675,
      Math.acos(6.6 / 6.75),
      Math.PI - Math.acos(6.6 / 6.75),
    );
    ctx.lineTo(x(-6.6), 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x(6.6), 0);
    ctx.lineTo(x(6.6), z(2.86));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x(0), z(1.45), 125, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x(0), z(14), 180, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "#d8dbc399";
    ctx.fillText("WESTSIDE", 750, 1230);
    ctx.font = "18px Arial";
    ctx.fillText("AFTERHOURS ATHLETIC CLUB", 750, 1270);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8;
    const floor = this.mesh(
      new T.PlaneGeometry(15, 14),
      new T.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.003, 7);
    floor.receiveShadow = true;
    this.box(0, 1.8, -0.95, 0.18, 3.6, 0.18, 0x243c43);
    this.tube([0, 3.45, -0.95], [0, 3.6, 1.03], 0.08, 0x263b42);
    this.box(0, 3.4, 1.045, 1.88, 1.16, 0.07, 0xd5e0d6);
    this.box(0, 3.36, 1.087, 0.65, 0.5, 0.012, 0xe28b5c);
    this.box(0, 3.38, 1.1, 0.56, 0.41, 0.014, 0xd4ddd4);
    this.box(0, 3.07, 1.15, 0.14, 0.05, 0.15, 0xcf613b);
    this.rim = this.mesh(
      new T.TorusGeometry(C.rimRadius, C.rimTube, 10, 48),
      this.mat(0xd95c30),
    );
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.set(0, C.hoop.y, C.hoop.z);
    this.tube([0, 3.05, 1.1], [0, 3.05, 1.22], 0.026, 0xd95c30);
    this.net = new T.Group();
    this.scene.add(this.net);
    this.net.position.set(0, 3.05, 1.45);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2,
        b = ((i + 1) / 12) * Math.PI * 2;
      this.line(
        [
          [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22],
          [Math.cos(b) * 0.15, -0.42, Math.sin(b) * 0.15],
        ],
        0xe9e4d1,
        this.net,
      );
      this.line(
        [
          [Math.cos(b) * 0.22, 0, Math.sin(b) * 0.22],
          [Math.cos(a) * 0.15, -0.42, Math.sin(a) * 0.15],
        ],
        0xe9e4d1,
        this.net,
      );
    }
    this.netPulse = 0;
  }
  createEnvironment() {
    this.box(0, -0.38, 0, 180, 0.2, 180, 0x9b9681);
    this.box(0, -0.11, -3, 24, 0.12, 3, 0x6a7a75);
    for (const side of [-1, 1]) {
      for (let z = -1; z <= 15; z += 4) {
        this.tube([side * 8.3, 0, z], [side * 8.3, 3, z], 0.035, 0x40545a);
      }
      this.line(
        [
          [side * 8.3, 3, -1],
          [side * 8.3, 3, 15],
        ],
        0x44565b,
      );
      for (let z = -1; z < 15; z += 0.4)
        this.line(
          [
            [side * 8.3, 0.1, z],
            [side * 8.3, 3, Math.min(15, z + 2)],
          ],
          0x5e6f6b,
        );
    }
    for (let x = -8; x < 9; x += 0.4) {
      this.line(
        [
          [x, 0, -1.7],
          [Math.min(9, x + 2), 3, -1.7],
        ],
        0x6d7770,
      );
    }
    for (let x = -8; x < 9; x += 4)
      this.tube([x, 0, -1.7], [x, 3, -1.7], 0.04, 0x445b60);
    this.line(
      [
        [-8, 3, -1.7],
        [9, 3, -1.7],
      ],
      0x526465,
    );
    for (let i = 0; i < 22; i++) {
      const x = (i - 11) * 5.5;
      const h = 4 + (Math.sin(i * 6.2) * 0.5 + 0.5) * 13;
      const z = -17 - (i % 3) * 6;
      this.box(x, h / 2 - 0.5, z, 4.8, h, 5, i % 2 ? 0x687c80 : 0x7b8684);
      for (let floor = 1; floor < h - 1; floor += 2)
        for (let col = -1; col <= 1; col++)
          this.box(
            x + col * 1.1,
            floor,
            z + 2.51,
            0.48,
            0.8,
            0.02,
            (i + col) % 4 === 0 ? 0xdac092 : 0x536c73,
          );
    }
    for (const x of [-10, 10]) {
      this.tube([x, 0, 5], [x, 7, 5], 0.065, 0x394f55);
      this.tube([x, 7, 5], [x * 0.88, 7, 5], 0.06, 0x394f55);
      const lamp = this.box(x * 0.88, 6.95, 5, 0.48, 0.1, 0.3, 0xffe1a0);
      lamp.material = new T.MeshBasicMaterial({ color: 0xffe1a0 });
    }
    for (let k = 0; k < 2; k++) {
      const x = k ? -10 : 10,
        z = k ? 11 : 0;
      this.box(x, 0.5, z, 1.6, 0.13, 0.5, 0x775f47);
      this.box(x, 0.8, z - 0.2, 1.6, 0.45, 0.08, 0x775f47);
      this.box(x - 0.6, 0.25, z, 0.08, 0.5, 0.35, 0x344e54);
      this.box(x + 0.6, 0.25, z, 0.08, 0.5, 0.35, 0x344e54);
    }
    const sun = this.mesh(
      new T.SphereGeometry(3, 24, 16),
      new T.MeshBasicMaterial({ color: 0xffdab0 }),
    );
    sun.position.set(-20, 17, -65);
  }
  createPlayer(color, id) {
    const root = new T.Group();
    this.scene.add(root);
    const body = new T.Group();
    root.add(body);
    const skin = id ? 0x674737 : 0x9b6548;
    const torso = this.mesh(
      new T.CylinderGeometry(0.25, 0.21, 0.58, 8),
      this.mat(color),
      body,
    );
    torso.position.y = 1.19;
    torso.castShadow = true;
    this.box(0, 0.85, 0, 0.43, 0.23, 0.28, 0x233f48, body);
    const head = this.mesh(
      new T.SphereGeometry(0.18, 12, 10),
      this.mat(skin),
      body,
    );
    head.position.y = 1.68;
    head.scale.y = 1.12;
    head.castShadow = true;
    const hair = this.mesh(
      new T.SphereGeometry(0.184, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
      this.mat(0x202627),
      body,
    );
    hair.position.y = 1.75;
    this.box(0, 1.56, 0.02, 0.13, 0.13, 0.13, skin, body);
    const arms = [],
      forearms = [],
      legs = [];
    for (const s of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(s * 0.29, 1.43, 0);
      body.add(arm);
      const upper = this.mesh(
        new T.CapsuleGeometry(0.078, 0.23, 3, 8),
        this.mat(skin),
        arm,
      );
      upper.position.y = -0.16;
      const fore = new T.Group();
      fore.position.y = -0.32;
      arm.add(fore);
      const lower = this.mesh(
        new T.CapsuleGeometry(0.068, 0.23, 3, 8),
        this.mat(skin),
        fore,
      );
      lower.position.y = -0.15;
      const hand = this.mesh(
        new T.SphereGeometry(0.077, 8, 6),
        this.mat(skin),
        fore,
      );
      hand.position.y = -0.32;
      arms.push(arm);
      forearms.push(fore);
      const leg = new T.Group();
      leg.position.set(s * 0.125, 0.8, 0);
      body.add(leg);
      const shorts = this.mesh(
        new T.CylinderGeometry(0.14, 0.13, 0.28, 8),
        this.mat(0x233f48),
        leg,
      );
      shorts.position.y = -0.1;
      const shin = this.mesh(
        new T.CapsuleGeometry(0.086, 0.38, 3, 8),
        this.mat(skin),
        leg,
      );
      shin.position.y = -0.42;
      this.box(
        0,
        -0.65,
        0.055,
        0.19,
        0.13,
        0.32,
        id ? 0xebe7d5 : 0xe6b978,
        leg,
      );
      legs.push(leg);
    }
    const num = document.createElement("canvas");
    num.width = 128;
    num.height = 128;
    const ctx = num.getContext("2d");
    ctx.fillStyle = "#f5ebd2";
    ctx.font = "bold 88px Arial";
    ctx.textAlign = "center";
    ctx.fillText(id ? "07" : "23", 64, 96);
    const map = new T.CanvasTexture(num);
    const label = this.mesh(
      new T.PlaneGeometry(0.27, 0.27),
      new T.MeshBasicMaterial({ map, transparent: true, side: T.DoubleSide }),
      body,
    );
    label.position.set(0, 1.23, 0.24);
    const label2 = label.clone();
    label2.position.z = -0.24;
    label2.rotation.y = Math.PI;
    body.add(label2);
    return {
      root,
      body,
      torso,
      arms,
      forearms,
      legs,
      id,
      skin,
      labels: [label, label2],
      jersey: color,
    };
  }
  ballSeams() {
    for (let axis = 0; axis < 3; axis++) {
      const seam = this.mesh(
        new T.TorusGeometry(0.1205, 0.003, 4, 40),
        this.mat(0x302a22),
        this.ball,
      );
      if (axis === 1) seam.rotation.y = Math.PI / 2;
      if (axis === 2) seam.rotation.x = Math.PI / 2;
    }
  }
  customize(settings) {
    const c = this.characters[0];
    c.torso.material = this.mat(settings.color || "#e9974f");
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f5ebd2";
    ctx.font = "bold 88px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(settings.number || 23), 64, 96);
    const tex = new T.CanvasTexture(canvas);
    for (const label of c.labels) {
      label.material = label.material.clone();
      label.material.map = tex;
    }
  }
  setQuality(q) {
    this.quality = q;
    this.dpr =
      q === "low"
        ? 1
        : q === "high"
          ? Math.min(devicePixelRatio, 2)
          : Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = q !== "low";
    this.resize();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }
  update(g, dt, menu = false, localId = 0) {
    this.menu = menu;
    const cameraPos = menu
      ? this.temp.set(15, 12, 22)
      : this.temp.set(0, 12.5, 20.8);
    if (!menu) {
      const p = g.players[localId];
      cameraPos.x = p.x * 0.23;
      cameraPos.z += clamp(p.z - 7, -4, 5) * 0.2;
    }
    const damp = 1 - Math.exp(-dt * 3);
    this.camera.position.lerp(cameraPos, damp);
    this.temp.set(menu ? -2.8 : 0, menu ? 0 : 0.3, menu ? 5.3 : 5.4);
    this.look.lerp(this.temp, damp);
    this.camera.lookAt(this.look);
    for (let i = 0; i < 2; i++) {
      const p = g.players[i],
        c = this.characters[i];
      c.root.visible = !(g.mode === "practice" && i === 1);
      c.root.position.set(p.x, p.y, p.z);
      let delta = Math.atan2(
        Math.sin(p.angle - c.root.rotation.y),
        Math.cos(p.angle - c.root.rotation.y),
      );
      c.root.rotation.y += delta * Math.min(1, dt * 13);
      const speed = Math.hypot(p.vx, p.vz),
        stride = Math.sin(p.phase * 5.1) * Math.min(0.7, speed * 0.18);
      c.legs[0].rotation.x = stride;
      c.legs[1].rotation.x = -stride;
      c.body.position.y =
        speed > 0.2 ? Math.abs(Math.sin(p.phase * 5.1)) * 0.04 : 0;
      c.body.rotation.x = p.defending ? 0.13 : 0;
      c.arms[0].rotation.set(-stride * 0.4, 0, 0.08);
      c.arms[1].rotation.set(stride * 0.4, 0, -0.08);
      c.forearms.forEach((a) => (a.rotation.x = -0.28));
      if (p.defending) {
        c.arms[0].rotation.z = 0.8;
        c.arms[1].rotation.z = -0.8;
        c.legs[0].rotation.z = 0.12;
        c.legs[1].rotation.z = -0.12;
      } else {
        c.legs.forEach((l) => (l.rotation.z = 0));
      }
      if (g.ball.owner === i && !p.charging) {
        const hand = p.hand === 1 ? 1 : 0;
        c.arms[hand].rotation.x =
          -0.2 - Math.abs(Math.cos(p.phase * Math.PI)) * 0.48;
        c.forearms[hand].rotation.x = -0.6;
      }
      if (
        p.charging ||
        p.state === "SHOOTING" ||
        p.state === "BLOCKING" ||
        p.state === "DUNK" ||
        p.state === "LAYUP"
      ) {
        c.arms.forEach((a) => (a.rotation.x = -2.65));
        c.forearms.forEach((a) => (a.rotation.x = -0.35));
      }
      if (p.moveTime > 0 && p.moveKind === "spin")
        c.body.rotation.y = (0.7 - p.moveTime) * Math.PI * 3;
      else c.body.rotation.y = 0;
    }
    const b = g.ball;
    this.ball.position.set(b.x, b.y, b.z);
    this.ball.rotation.x += dt * (b.owner !== null ? 6 : b.vz * 1.8);
    this.ball.rotation.z -= dt * b.vx * 1.8;
    this.shadow.position.set(b.x, 0.015, b.z);
    this.shadow.scale.setScalar(1 + b.y * 0.12);
    this.shadow.material.opacity = 0.25 / (1 + b.y * 0.2);
    const p = g.players[localId];
    this.ring.position.set(p.x, 0.022, p.z);
    this.ring.visible = !menu;
    this.netPulse = Math.max(0, this.netPulse - dt);
    this.net.scale.set(
      1 + Math.sin(this.netPulse * 40) * this.netPulse * 0.2,
      1 + this.netPulse * 0.3,
      1 + Math.cos(this.netPulse * 40) * this.netPulse * 0.2,
    );
    this.renderer.render(this.scene, this.camera);
    this.frameTotal += dt;
    this.frameCount++;
    if (this.frameTotal > 2) {
      this.fps = this.frameCount / this.frameTotal;
      if (this.quality === "auto" && this.fps < 42 && this.dpr > 1) {
        this.dpr = Math.max(1, this.dpr - 0.25);
        this.renderer.setPixelRatio(this.dpr);
      }
      this.frameTotal = 0;
      this.frameCount = 0;
    }
  }
}
