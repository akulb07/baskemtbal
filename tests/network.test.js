import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { attachRooms, validateInput } from "../server/rooms.js";
import { emptyInput } from "../dist/src/config.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect(url) {
  const ws = new WebSocket(url);
  const messages = [];
  ws.on("message", (b) => messages.push(JSON.parse(b)));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return {
    ws,
    messages,
    send: (m) => ws.send(JSON.stringify(m)),
    async until(type, predicate = () => true) {
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const m = messages.find((m) => m.type === type && predicate(m));
        if (m) return m;
        await wait(15);
      }
      throw Error(`Timed out waiting for ${type}`);
    },
  };
}
test("input validation rejects malformed vectors and strips forged authority fields", () => {
  assert.equal(validateInput({ x: Infinity, z: 0 }), null);
  assert.equal(validateInput({ x: "1", z: 0 }), null);
  const input = validateInput({
    x: 9,
    z: -8,
    score: [99, 0],
    owner: 1,
    move: "teleport",
  });
  assert.equal(input.x, 1);
  assert.equal(input.z, -1);
  assert.equal(input.score, undefined);
  assert.equal(input.move, null);
});
test("private room, ready gate, synchronized movement, forged score rejection, and reconnect", async () => {
  const server = http.createServer();
  const { rooms, wss } = attachRooms(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const clients = [];
  try {
    const a = await connect(url);
    clients.push(a);
    a.send({ type: "create", name: "A" });
    const joined = await a.until("joined");
    assert.match(joined.code, /^[A-F0-9]{5}$/);
    a.send({ type: "ready" });
    await wait(50);
    assert.ok(!a.messages.some((m) => m.type === "start"));
    const b = await connect(url);
    clients.push(b);
    b.send({ type: "join", code: joined.code, name: "B" });
    const bj = await b.until("joined");
    assert.equal(bj.slot, 1);
    b.send({ type: "ready" });
    await a.until("start");
    await b.until("start");
    const initial = await a.until("snapshot", (m) => m.state.state === "LIVE");
    let seq = 0;
    const sendLoop = setInterval(() => {
      a.send({
        type: "input",
        seq: ++seq,
        timestamp: Date.now(),
        input: { ...emptyInput(), x: 1, score: [500, 0] },
      });
      b.send({
        type: "input",
        seq,
        timestamp: Date.now(),
        input: { ...emptyInput(), x: -1 },
      });
    }, 34);
    await wait(450);
    clearInterval(sendLoop);
    await a.until('snapshot', m => m.ack[0] === seq);
    const as = a.messages.filter((m) => m.type === "snapshot").at(-1);
    const bs = b.messages.filter((m) => m.type === "snapshot").at(-1);
    assert.ok(as.state.players[0].x > initial.state.players[0].x + 0.2);
    assert.deepEqual(as.state.score, [0, 0]);
    assert.deepEqual(as.state.score, bs.state.score);
    assert.equal(as.ack[0], seq);
    b.ws.close();
    await a.until("reconnecting");
    const resumed = await connect(url);
    clients.push(resumed);
    resumed.send({ type: "resume", code: joined.code, token: bj.token });
    assert.equal((await resumed.until("joined")).slot, 1);
    await resumed.until("start");
    assert.equal(rooms.get(joined.code).slots[1].disconnected, 0);
    // Rematches require agreement from both players and reset server-owned state.
    const room = rooms.get(joined.code);
    room.game.state = "GAME_OVER";
    room.game.score = [11, 7];
    a.send({ type: "rematch" });
    await wait(40);
    assert.deepEqual(room.game.score, [11, 7]);
    resumed.send({ type: "rematch" });
    await wait(60);
    assert.deepEqual(room.game.score, [0, 0]);
    assert.equal(room.game.state, "CHECK_BALL");
  } finally {
    for (const c of clients) c.ws.terminate();
    wss.close();
    await new Promise((r) => server.close(r));
  }
});
test("quick match pairs two waiting humans", async () => {
  const server = http.createServer();
  const { wss } = attachRooms(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const clients = [];
  try {
    const a = await connect(url);
    clients.push(a);
    a.send({ type: "quick", name: "A" });
    const first = await a.until("joined");
    const b = await connect(url);
    clients.push(b);
    b.send({ type: "quick", name: "B" });
    const second = await b.until("joined");
    assert.equal(first.code, second.code);
    assert.equal(second.slot, 1);
  } finally {
    for (const c of clients) c.ws.terminate();
    wss.close();
    await new Promise((r) => server.close(r));
  }
});

test('2v2 waits for four humans, routes slot 3 input, passes to teammate, reconnects and requires four rematch votes', async () => {
  const server=http.createServer();
  const {rooms,wss}=attachRooms(server);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`ws://127.0.0.1:${server.address().port}/ws`, clients=[];
  try {
    let code, lastToken;
    for (let i=0;i<4;i++) {
      const c=await connect(url); clients.push(c);
      c.send(i===0?{type:'create',mode:'online2v2'}:{type:'join',code});
      const joined=await c.until('joined');
      code=joined.code; lastToken=joined.token;
      assert.equal(joined.slot,i); assert.equal(joined.capacity,4);
      c.send({type:'ready'});
      if (i<3) { await wait(30); assert.ok(!clients[0].messages.some(m=>m.type==='start')); }
    }
    const start=await clients[3].until('start');
    assert.deepEqual(start.state.players.map(p=>p.team),[0,1,0,1]);
    const extra=await connect(url); clients.push(extra);
    extra.send({type:'join',code});
    assert.match((await extra.until('error')).message,/full/);
    const room=rooms.get(code);
    room.game.state='LIVE'; room.game.timer=0;
    const initial=room.game.players[3].x;
    clients[3].send({type:'input',seq:1,input:{...emptyInput(),x:1}});
    await clients[0].until('snapshot',m=>m.ack[3]===1 && m.state.players[3].x>initial+.1);
    room.game.players.forEach((p,i)=>Object.assign(p,{x:6,z:12-i,y:0,vx:0,vz:0}));
    Object.assign(room.game.players[0],{x:-3,z:7});
    Object.assign(room.game.players[2],{x:3,z:7});
    room.game.ball.owner=0;
    clients[0].send({type:'input',seq:1,input:{...emptyInput(),pass:true,x:1}});
    await clients[2].until('snapshot',m=>m.state.ball.passing && m.state.ball.passTarget===2);
    await clients[2].until('snapshot',m=>m.state.ball.owner===2);
    clients[3].ws.close();
    await clients[0].until('reconnecting');
    const resumed=await connect(url); clients.push(resumed);
    resumed.send({type:'resume',code,token:lastToken});
    assert.equal((await resumed.until('joined')).slot,3);
    assert.equal((await resumed.until('start')).state.players.length,4);
    room.game.state='GAME_OVER'; room.game.score=[11,7];
    clients.slice(0,3).forEach(c=>c.send({type:'rematch'}));
    await clients[0].until('rematch',m=>m.count===3);
    assert.deepEqual(room.game.score,[11,7]);
    resumed.send({type:'rematch'});
    await clients[0].until('rematch',m=>m.count===4);
    assert.deepEqual(room.game.score,[0,0]);
    assert.equal(room.game.state,'CHECK_BALL');
    assert.equal(room.game.players.length,4);
  } finally {
    clients.forEach(c=>c.ws.terminate()); wss.close();
    await new Promise(r=>server.close(r));
  }
});
