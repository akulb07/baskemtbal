import { WebSocketServer, WebSocket } from "ws";
import { randomBytes } from "node:crypto";
import { GameSimulation } from "../dist/src/simulation.js";
import { C, emptyInput, clamp } from "../dist/src/config.js";
import { MOVES, FINISHES } from '../dist/src/moves.js';

export function validateInput(raw) {
  if (!raw || typeof raw !== "object") return null;
  for (const k of ["x", "z"])
    if (typeof raw[k] !== "number" || !Number.isFinite(raw[k])) return null;
  return {
    x: clamp(raw.x, -1, 1),
    z: clamp(raw.z, -1, 1),
    shoot: raw.shoot === true,
    sprint: raw.sprint === true,
    defend: raw.defend === true,
    steal: raw.steal === true,
    block: raw.block === true,
    bank: raw.bank === true,
    move: Object.hasOwn(MOVES, raw.move) ? raw.move : null,
    post: raw.post === true,
    pass: raw.pass === true,
    screen: raw.screen === true,
    finish: FINISHES.includes(raw.finish) ? raw.finish : 'auto',
  };
}
export function attachRooms(server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
  const rooms = new Map();
  let quick = null;
  const send = (ws, data) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };
  const broadcast = (room, data) =>
    room.slots.forEach((s) => s && send(s.ws, data));
  function roomInfo(room) {
    broadcast(room, {
      type: "room",
      code: room.code,
      players: room.slots.filter(Boolean).map((s) => s.name),
      count: room.slots.filter(Boolean).length,
      capacity: room.capacity,
      mode: room.mode,
    });
  }
  function start(room) {
    room.game = new GameSimulation(room.mode);
    room.game.timer = 3;
    room.running = true;
    room.rematch.clear();
    room.history = [];
    room.slots.forEach((s) => {
      s.input = emptyInput();
      s.ready = false;
    });
    broadcast(room, { type: "start", state: room.game.snapshot() });
  }
  function tryStart(room) {
    if (
      room.slots.length === room.capacity &&
      room.slots.every((s) => s?.ws?.readyState === WebSocket.OPEN && s.ready)
    )
      start(room);
  }
  function join(ws, room, slot) {
    const token = randomBytes(24).toString("hex");
    room.slots[slot] = {
      ws,
      token,
      name: ws.playerName,
      input: emptyInput(),
      seq: 0,
      lastInput: Date.now(),
      ready: false,
      disconnected: 0,
    };
    ws.room = room;
    ws.slot = slot;
    send(ws, { type: "joined", code: room.code, slot, token, capacity: room.capacity, mode: room.mode });
    roomInfo(room);
    if (room.slots.length === 2 && room.slots.every(Boolean) && quick === room)
      quick = null;
  }
  function create(ws, isQuick, mode = 'online') {
    let code;
    do {
      code = randomBytes(4).toString("hex").slice(0, 5).toUpperCase();
    } while (rooms.has(code));
    const room = {
      code,
      mode,
      capacity: mode === 'online2v2' ? 4 : 2,
      slots: [],
      game: new GameSimulation(mode),
      running: false,
      rematch: new Set(),
      history: [],
      created: Date.now(),
    };
    rooms.set(code, room);
    if (isQuick) quick = room;
    join(ws, room, 0);
  }
  wss.on("connection", (ws) => {
    ws.alive = true;
    ws.budget = 0;
    ws.budgetTime = Date.now();
    ws.playerName = "PLAYER";
    send(ws, { type: "hello", time: Date.now() });
    ws.on("message", (buffer) => {
      if (Date.now() - ws.budgetTime > 1000) {
        ws.budget = 0;
        ws.budgetTime = Date.now();
      }
      if (++ws.budget > 100) {
        ws.close(1008, "Rate limit");
        return;
      }
      let m;
      try {
        m = JSON.parse(buffer.toString());
      } catch {
        return;
      }
      if (m.type === "ping") {
        send(ws, { type: "pong", sent: m.sent, time: Date.now() });
        return;
      }
      if (m.type === "resume") {
        const room = rooms.get(String(m.code).toUpperCase()),
          slot = room?.slots.findIndex((s) => s?.token === m.token);
        if (room && slot >= 0) {
          const s = room.slots[slot];
          if (s.ws?.readyState === WebSocket.OPEN)
            s.ws.close(4001, "Replaced connection");
          s.ws = ws;
          s.disconnected = 0;
          ws.room = room;
          ws.slot = slot;
          send(ws, { type: "joined", code: room.code, slot, token: s.token, capacity: room.capacity, mode: room.mode });
          broadcast(room, { type: "reconnected" });
          if (room.running)
            send(ws, { type: "start", state: room.game.snapshot() });
          else roomInfo(room);
        } else
          send(ws, {
            type: "error",
            message: "This room has expired. Create a new game.",
          });
        return;
      }
      if (!ws.room) {
        ws.playerName =
          String(m.name || "PLAYER")
            .replace(/[<>]/g, "")
            .trim()
            .slice(0, 16) || "PLAYER";
        if (m.type === "create") create(ws, false, m.mode === 'online2v2' ? 'online2v2' : 'online');
        else if (m.type === "quick") {
          if (
            quick &&
            Date.now() - quick.created < 300000 &&
            quick.slots[0]?.ws?.readyState === WebSocket.OPEN
          )
            join(ws, quick, 1);
          else create(ws, true);
        } else if (m.type === "join") {
          const room = rooms.get(String(m.code || "").toUpperCase());
          if (!room)
            send(ws, {
              type: "error",
              message: "Room not found. Check the code.",
            });
          else if (room.slots.length >= room.capacity)
            send(ws, {
              type: "error",
              message: "This room is full.",
            });
          else join(ws, room, room.slots.length);
        }
        return;
      }
      const room = ws.room,
        s = room.slots[ws.slot];
      if (m.type === "ready") {
        if (room.running) return;
        s.ready = true;
        tryStart(room);
      } else if (m.type === "input" && room.running) {
        const input = validateInput(m.input);
        if (
          !input ||
          !Number.isSafeInteger(m.seq) ||
          m.seq <= s.seq ||
          m.seq > s.seq + 600
        )
          return;
        s.seq = m.seq;
        s.input = input;
        s.lastInput = Date.now();
        s.timestamp = Number.isFinite(m.timestamp)
          ? clamp(m.timestamp, Date.now() - 100, Date.now())
          : Date.now();
      } else if (m.type === "rematch" && room.game.state === "GAME_OVER") {
        room.rematch.add(ws.slot);
        broadcast(room, { type: "rematch", count: room.rematch.size });
        if (room.rematch.size === room.capacity) start(room);
      } else if (m.type === "leave") {
        ws.close(1000, "Left room");
      }
    });
    ws.on("close", () => {
      const room = ws.room;
      if (!room) return;
      const s = room.slots[ws.slot];
      if (s?.ws !== ws) return;
      s.disconnected = Date.now();
      s.input = emptyInput();
      broadcast(room, { type: "reconnecting", seconds: C.reconnectSeconds });
    });
  });
  let last = performance.now(),
    acc = 0,
    snapshotAcc = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    acc += Math.min((now - last) / 1000, 0.1);
    last = now;
    while (acc >= C.dt) {
      for (const room of rooms.values()) {
        if (!room.running) continue;
        const disconnected = room.slots.find((s) => s.disconnected);
        if (disconnected) {
          if (
            Date.now() - disconnected.disconnected >
            C.reconnectSeconds * 1000
          ) {
            broadcast(room, {
              type: "ended",
              message:
                "A player disconnected. Return to the menu to start a new game.",
            });
            room.running = false;
          }
          continue;
        }
        room.slots.forEach((s) => {
          if (Date.now() - s.lastInput > 350) s.input = emptyInput();
        });
        let historical = null;
        const action = room.slots.find(
          (s) =>
            s.input.steal ||
            s.input.block ||
            (!s.input.shoot &&
              room.game.players[room.slots.indexOf(s)].charging),
        );
        if (action && room.history.length) {
          const target = action.timestamp || Date.now();
          historical = room.history.reduce((best, h) =>
            Math.abs(h.time - target) < Math.abs(best.time - target) ? h : best,
          ).players;
        }
        room.game.step(
          C.dt,
          room.slots.map((s) => s.input),
          historical,
        );
        room.slots.forEach((s) => {
          s.input.steal = false;
          s.input.block = false;
          s.input.move = null;
          s.input.pass = false;
        });
        room.history.push({
          time: Date.now(),
          players: room.game.players.map((p) => ({
            id: p.id,
            x: p.x,
            z: p.z,
            y: p.y,
            defending: p.defending,
          })),
        });
        if (room.history.length > 24) room.history.shift();
      }
      acc -= C.dt;
      snapshotAcc += C.dt;
    }
    if (snapshotAcc >= 1 / C.networkHz) {
      snapshotAcc = 0;
      for (const room of rooms.values()) {
        if (room.running)
          broadcast(room, {
            type: "snapshot",
            state: room.game.snapshot(),
            ack: room.slots.map((s) => s.seq),
            time: Date.now(),
          });
        if (
          Date.now() - room.created > 3600000 ||
          (!room.running &&
            room.slots.every((s) => s.ws.readyState !== WebSocket.OPEN) &&
            Date.now() - room.created > 60000)
        ) {
          rooms.delete(room.code);
          if (quick === room) quick = null;
        }
      }
    }
  }, 8);
  server.on("close", () => {
    clearInterval(timer);
    wss.close();
  });
  return { rooms, wss };
}
