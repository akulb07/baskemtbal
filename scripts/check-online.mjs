import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { NetworkManager } from '../dist/src/network.js';
import { hostedServer } from '../dist/src/multiplayer.js';
import { emptyInput } from '../dist/src/config.js';

globalThis.WebSocket = WebSocket;
const messages = [[], []];
const clients = messages.map(list => new NetworkManager(message => list.push(message)));
async function until(slot, type, predicate = () => true) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const message = messages[slot].find(m => m.type === type && predicate(m));
    if (message) return message;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error(`Player ${slot}: no ${type}; ${messages[slot].filter(m => m.type === 'error').map(m => m.message)}`);
}
try {
  clients[0].connect(hostedServer, 'create', 'CHECK A');
  const room = await until(0, 'joined');
  assert.match(room.code, /^[A-F0-9]{5}$/);
  clients[1].connect(hostedServer, 'join', 'CHECK B', room.code);
  assert.equal((await until(1, 'joined')).code, room.code);
  await Promise.all([until(0, 'start'), until(1, 'start')]);
  await until(0, 'snapshot', m => m.state.state === 'LIVE');
  clients[0].submit({ ...emptyInput(), x: 1 });
  await Promise.all([until(0, 'snapshot', m => m.ack[0] >= 1), until(1, 'snapshot', m => m.ack[0] >= 1)]);
  console.log('PASS: live room created, second player joined, both started and received acknowledged input.');
} finally {
  clients.forEach(client => client.disconnect());
}
