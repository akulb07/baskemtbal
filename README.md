# Afterhours — Streetball

A runnable Three.js half-court basketball game with AI, same-keyboard 1v1, free practice, and an authoritative Node/WebSocket multiplayer server. Character models, court textures, animation, and sound are procedural; no downloaded character or audio assets are required. Google Fonts are optional and have local fallbacks.

## Run locally

Requires Node.js 22 or later.

```sh
npm install
npm run build
npm start
```

Open `http://localhost:4173`. The same process serves the game and `/ws`. Set `PORT` to override 4173. After editing source, reload the browser; no bundler or hot reload is required. `dist/` contains the editable browser source and local Three.js vendor files. `npm run build` refreshes the vendored Three.js files.

## Controls

| Action | Player 1 | Player 2 |
|---|---|---|
| Move | WASD | Arrow keys |
| Sprint | Left Shift | Right Shift |
| Shoot / pump fake | Hold/release Space; tap to fake | Hold/release Enter |
| Crossover | C | Comma |
| Cycle dribble moves | Q | Slash |
| Step back | X | M |
| Steal | E | Period |
| Jump / hold defensive stance | F | L |
| Bank modifier | B while shooting | N while shooting |
| Pause | Escape | Escape |
| Debug | F3, or `?debug=1` | — |

Controls can be rebound in Settings. Keep both sets distinct; some keyboards cannot register particular combinations simultaneously.

### Dunking

Build speed with Shift while driving toward the rim. Start holding Space when you are roughly 1–2.4 metres from the hoop, with at least 29 stamina and an open approach. Release in the green after about 0.53 seconds. Your player takes off during the gather and releases the ball above the rim. The touch SHOOT label changes to DUNK when eligible. A stationary close attempt is a layup; a crowded or mistimed gather may become a layup. Dunks still use ball trajectories and scoring-plane detection.

### Getting better

Start in Practice and learn the green release: about 0.68 seconds for jumpers, 0.53 for layups/dunks. Moving shots, fatigue, distance, and a defender in front make timing less forgiving. Use a crossover or stepback to create room, stop, then shoot. Mix drives with jumpers. On defense, occupy the lane between the attacker and hoop; jump near the release instead of repeatedly reaching. Failed steals briefly slow recovery. Take defensive rebounds beyond the three-point arc before attacking.

### Touch

Landscape is recommended. Drag the left stick; hold DRIVE to sprint and double tap it for an in-and-out burst. Tap MOVE for a crossover; swipe left/right for behind-the-back/between-the-legs, down for stepback, up for spin. Hold and release SHOOT for timing, or tap it to fake. DEFEND initiates a jump/reach and holds a stance; SHOOT becomes BLOCK on defense. Touch controls use pointer capture and support simultaneous joystick and button input. On-screen pause, restart, and rematch require no keyboard. Same-device local PvP is intended for keyboards, not two phone control sets.

## Rules and simulation

First to 11, win by two, 1 point inside and 2 outside the arc; 24-second clock, check after baskets, turnovers on bounds or clock violations, 14-second minimum reset on rim contact. Offensive rebounds continue; defensive rebounds require clearance. Practice has unlimited time and automatically returns escaped balls.

Both players use the same `Player` entity, attributes, movement, shooting, stamina, contact resolution, steals, blocks, and rebounding. Input controllers never set scores. Simulation runs at 120 Hz independently of rendering, with clamped catch-up after stalls. Explicit match states are MENU (UI), CHECK_BALL, LIVE, SHOT_IN_AIR, LOOSE_BALL, DEAD_BALL, SCORE, PAUSED (UI), and GAME_OVER.

Shots solve projectile velocity from release, apex, and target. Timing, geometric contest, movement, fatigue, and distance introduce controlled error. Rim collisions use distance to a torus centreline; backboard collision uses a swept plane; floor bounce has restitution/friction. A basket requires downward crossing of the rim plane inside its opening. Blocks redirect the actual ball; rebounds require player proximity and reachable height. The net is a lightweight visual reaction, not cloth simulation.

## AI logic and tuning

`dist/src/ai.js` is a delayed decision controller. It observes current positions and shot preparation, not future inputs. Defense targets a point about 1.15 m between ball handler and basket, predicts a little current velocity, jumps against a nearby gathered shot, and reaches only at exposed low dribbles. Offense clears rebounds, changes direction, drives through an open lane, shoots with space or clock pressure, and predicts a ball's landing point for rebounds.

| Difficulty | Decision interval | Maximum timing offset |
|---|---:|---:|
| Rookie | 380 ms | 170 ms |
| Pro | 230 ms | 75 ms |
| All-Star | 150 ms | 45 ms |
| Elite | 110 ms | 25 ms |

All difficulties have the same physical attributes as humans. Edit `DIFFICULTY` for reaction and timing, and `C` in `config.js` for movement speed, gravity, timing window, stamina-related constants, score, and clock. Player attributes are initialized equally and are exposed for future archetype tuning; not every rating yet scales a separate mechanic. Settings persist only on the current device.

## Online multiplayer

### Same Wi-Fi

1. Run `npm start` on the host computer.
2. Open `http://HOST_LAN_IP:4173` on both devices. Allow the chosen port through the host firewall if needed.
3. In Online 1v1, both use `ws://HOST_LAN_IP:4173/ws`.
4. Create a private room, share its code, and join on the other device. Alternatively both choose Quick Match on the same server.
5. Both clients report ready before the server starts a three-second countdown.

### Internet hosting

Deploy this directory to a Node host/container that supports persistent WebSockets. Run `npm ci && npm run build` at build time, and `npm start` at runtime. Expose `PORT` through an HTTPS reverse proxy with WebSocket upgrade support. Use `wss://YOUR_HOST/ws` from a secure page. Rooms are in memory; use a single server instance or sticky routing. Restarting the server discards rooms. No account is required.

The Sites deployment serves the static client, AI, local PvP, and practice. It does **not** host the companion Node process. Its Online screen accepts the address of a separately running WSS server. No fake opponents or matchmaking are used. This is explicitly an external server dependency, not an already provisioned public multiplayer service.

### Networking architecture

Clients send normalized, sequenced input at 30 Hz; server simulates at 120 Hz and snapshots at 30 Hz. Server input validation bounds movement, allowed actions, message size, sequence jumps, and message rate. Score, outcome, possession, shot clock, timing, and trajectories come from the server simulation. Unrecognized score/outcome fields are ignored. Clients predict locally and reconcile against acknowledged inputs. Remote player positions use a snapshot buffer with 85–180 ms jitter-sensitive interpolation. Held ball ownership/hand/phase and free-ball velocity/state travel in snapshots; this implementation also includes ball transforms for straightforward recovery.

The server retains 200 ms of position history and limits historical contest checks to 100 ms. Steals and blocks use current authoritative geometry; full lag-compensated contact rewind is not implemented. Ping/jitter and snapshot gaps are measured; the debug gap metric is not actual TCP packet loss. A disconnected player has 20 seconds to resume with an opaque room token. The match pauses during that grace period and ends safely on timeout. Both players must request a rematch to reset the existing room.

For a public service, add capacity controls, deployment observability, abuse protection, and region selection appropriate to expected traffic. Local and automated tests do not substitute for real two-phone, adverse-network validation.

## Architecture

- `dist/src/config.js`: tuning, attributes, input shape, explicit states.
- `dist/src/simulation.js`: shared Player and GameSimulation, movement/contact, dribbling, shots, defense, ball physics, rules, snapshots.
- `dist/src/input.js`: independent keyboard mappings and mobile Pointer Events.
- `dist/src/ai.js`: interchangeable delayed AI controller.
- `dist/src/rendering.js`: Three.js court, environment, humanoids, procedural animation, camera, adaptive renderer.
- `dist/src/game-manager.js`: mode lifecycle, HUD, dialogs, preferences, game loop, optional WebMCP tools.
- `dist/src/audio.js`: safe, user-activated Web Audio synthesis.
- `dist/src/network.js`: client connection, prediction/reconciliation, remote snapshot interpolation.
- `server/rooms.js`: validated inputs, sessions, private rooms/quick match, readiness, reconnect/rematch, authority.
- `server/server.js`: static HTTP server and WebSocket endpoint.

To add a controller, produce the input shape from `emptyInput()` and feed it into `GameSimulation.step`; never mutate Three.js meshes for gameplay. Add new moves/types in the simulation, give them stamina/recovery rules, then update input, visuals, and tests. Add physics test cases before tuning rim size or scoring tolerances.

## Graphics and verification

Low disables shadows and uses pixel ratio 1. Medium caps at 1.5; High caps at 2; Auto begins at 1.5 and reduces pixel ratio when observed FPS is below 42. Simulation timing does not change with graphics quality. F3 shows FPS, states, lane, distance, contest, stamina, ping, and snapshot-gap estimate. Modern WebGL2 is required.

Run `npm test`. Coverage includes physical makes/misses, upward/downward scoring, rim rebound, bank shot, airborne dunk, pump fake, contests, clock, rebounds/clearance, collision, blocks, win-by-two, reset, a complete AI match, input validation, two real WebSocket clients, ready gating, private/quick rooms, movement synchronization, reconnect, and rematch.

The menu/court was visually inspected in the desktop preview. Further browser and WebMCP interaction checks were blocked by the environment's automatic approval usage limit. Real Android/iOS/tablet, sustained 60 FPS, full touch-match acceptance, multi-device Internet latency, and packet-loss testing remain unverified. This is a playable compact implementation; hook shots, fully distinct finish animations, full contact lag compensation, and advanced production matchmaking remain extensions.
