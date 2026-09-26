import test from "node:test";
import assert from "node:assert/strict";
import { multiplayerURL, hostedServer } from "../dist/src/multiplayer.js";

test("public sites use the hosted room server, not Vercel's static /ws", () => {
  for (const hostname of ["baskemtbal.vercel.app", "preview.vercel.app", "example.com"])
    assert.equal(multiplayerURL({ hostname, host: hostname, protocol: "https:" }), hostedServer);
});

test("local and LAN games use their own server", () => {
  for (const hostname of ["localhost", "127.0.0.1", "192.168.1.10", "10.0.0.2", "172.16.0.2"])
    assert.equal(multiplayerURL({ hostname, host: `${hostname}:4173`, protocol: "http:" }), `ws://${hostname}:4173/ws`);
});
