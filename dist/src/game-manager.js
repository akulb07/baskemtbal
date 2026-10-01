import { SceneManager } from "./rendering.js";
import { GameSimulation } from "./simulation.js";
import { InputManager } from "./input.js";
import { KEY_ACTIONS, loadBindings, rebind, keyLabel } from "./keybinds.js";
import { AIInputController } from "./ai.js";
import { AudioManager } from "./audio.js";
import { NetworkManager } from "./network.js";
import { multiplayerURL } from "./multiplayer.js";
import { MOVES, FINISHES, shotTiming, releaseWindow } from './moves.js';
import { C, emptyInput, clamp, States } from "./config.js";
const $ = (id) => document.getElementById(id);
const isOnline = () => mode === 'online' || mode === 'online2v2';
const isTeam = () => mode === 'team' || mode === 'online2v2';
const teamLabel = i => i === game.team(localId) ? 'YOUR TEAM' : mode === 'team' ? 'GOATS' : 'OPPONENTS';
const defaults = {
  color: "#c8102e",
  number: 23,
  name: "YOU",
  camera: 1,
  server: "",
};
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("afterhours-settings") || "{}");
} catch {}
let settings = { ...defaults, ...saved };
for (const key of ["quality", "difficulty", "volume", "vibration"]) delete settings[key];
settings.bindings = loadBindings(settings.bindings);
settings.name = typeof settings.name === "string" ? settings.name.trim().slice(0, 16) || "YOU" : "YOU";
function saveSettings() {
  try {
    localStorage.setItem("afterhours-settings", JSON.stringify(settings));
  } catch {}
}
let scene,
  game = new GameSimulation(),
  mode = "ai",
  playing = false,
  paused = false,
  accumulator = 0,
  previous = performance.now(),
  ai = new AIInputController(),
  teamAI = [],
  localId = 0,
  lastEvent = 0,
  lastDribble = -1,
  networkAccumulator = 0,
  networkEdge = emptyInput(),
  bannerUntil = 0,
  debug = new URLSearchParams(location.search).has("debug"),
  gameOverShown = false;
const audio = new AudioManager();
try {
  scene = new SceneManager($("court"));
  scene.setQuality("high");
  scene.customize(settings);
  $("loading").hidden = true;
} catch (e) {
  $("load-status").textContent =
    "WebGL could not start. Enable hardware acceleration and reload.";
  console.error(e);
  throw e;
}
const input = new InputManager((background) => {
  if (background) pauseGame(true);
  else if ($("panel").open) closePanel();
  else pauseGame();
});
const network = new NetworkManager(handleNetwork);
function applySettings() {
  input.bindings = [{ ...settings.bindings }];
  input.clear();
  scene.setQuality("high");
  scene.customize(settings);
  saveSettings();
}
applySettings();
function selectMode(next) {
  if (!["ai", "online", 'online2v2', "practice", 'team'].includes(next))
    throw Error("Unknown mode");
  mode = next;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.mode === mode));
}
const mapNames = { day: "DAY", night: "NIGHT" };
if (!mapNames[settings.map]) settings.map = "day";
for (const button of document.querySelectorAll("[data-map]")) {
  button.onclick = () => {
    document.querySelectorAll("[data-map]").forEach((b) => {
      b.classList.toggle("selected", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    settings.map = button.dataset.map;
    scene.setMap(settings.map);
    $("map-location").textContent = mapNames[settings.map];
    saveSettings();
  };
}
if (settings.map && mapNames[settings.map]) {
  document.querySelector(`[data-map="${settings.map}"]`)?.click();
}
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => {
    selectMode(b.dataset.mode);
    audio.play("ui");
  };
function enterCourt() {
  playing = true;
  paused = false;
  gameOverShown = false;
  lastEvent = 0;
  accumulator = 0;
  networkAccumulator = 0;
  networkEdge = emptyInput();
  input.clear();
  input.enabled = true;
  document.body.classList.add("playing");
  document.body.classList.toggle('team-mode', isTeam());
  document.body.classList.toggle('online-team', mode === 'online2v2');
  $("hud").hidden = false;
  $("panel").close();
  $("p1-label").textContent = isTeam() ? teamLabel(0) : settings.name || "YOU";
  $("p2-label").textContent =
    isTeam() ? teamLabel(1) : mode === "ai" ? "GOAT" : mode === "practice" ? "SOLO" : "OPPONENT";
  $("feedback").textContent = "";
  $("banner").textContent = "";
  audio.unlock();
}
function startGame(next = mode) {
  selectMode(next);
  if (isOnline()) {
    openOnline();
    return;
  }
  network.disconnect();
  localId = 0;
  game = new GameSimulation(mode);
  ai = new AIInputController(1, "pro");
  teamAI = game.players.map(p => new AIInputController(p.id,'pro'));
  enterCourt();
}
$("play").onclick = () => startGame();
function mainMenu() {
  network.disconnect();
  playing = false;
  paused = false;
  input.enabled = false;
  input.clear();
  $("panel").close();
  document.body.classList.remove("playing");
  $("hud").hidden = true;
  game = new GameSimulation();
  game.players[0].x = -1.7;
  game.players[0].z = 7.4;
  game.players[1].x = 0.2;
  game.players[1].z = 5.5;
  game.updateHeldBall();
}
function showPanel(html) {
  $("panel-content").innerHTML = html;
  if (!$("panel").open) $("panel").showModal();
}
function closePanel() {
  if (isOnline() && !playing) network.disconnect();
  if (paused) resumeGame();
  else {
    $("panel").close();
    if (playing) input.enabled = true;
  }
}
$("close-panel").onclick = closePanel;
$("panel").addEventListener("cancel", (e) => {
  e.preventDefault();
  closePanel();
});
function pauseGame(background = false) {
  if (!playing) return;
  if (isOnline()) {
    input.clear();
    input.enabled = false;
    showPanel(
      '<span class="eyebrow">ONLINE MATCH</span><h2>MATCH IS LIVE</h2><p>Online games keep running while this menu is open.</p><button id="resume-game" class="primary">RETURN TO COURT →</button><button id="leave-game" class="secondary-button">LEAVE MATCH</button>',
    );
    $("resume-game").onclick = () => {
      input.enabled = true;
      $("panel").close();
    };
    $("leave-game").onclick = mainMenu;
    return;
  }
  if (paused) {
    if (!background) resumeGame();
    return;
  }
  paused = true;
  input.enabled = false;
  input.clear();
  showPanel(
    '<h2>PAUSED</h2><button id="resume-game" class="primary">BACK TO THE GAME →</button><button id="pause-controls" class="secondary-button">HOW TO PLAY</button><button id="restart-game" class="secondary-button">RESTART MATCH</button><button id="leave-game" class="secondary-button">MAIN MENU</button>',
  );
  $("resume-game").onclick = resumeGame;
  $("restart-game").onclick = () => startGame(mode);
  $("pause-controls").onclick = openControls;
  $("leave-game").onclick = mainMenu;
}
function resumeGame() {
  paused = false;
  input.clear();
  input.enabled = playing;
  $("panel").close();
}
$("pause").onclick = () => pauseGame();
function openControls() {
  showPanel(
    '<div class="control-grid"><div></div></div><button id="controls-done" class="primary">SAVE</button>',
  );
  const grid = document.querySelector('.control-grid');
  grid.replaceChildren();
  const draft = { ...settings.bindings };
  const fields = {};
  const refresh = () => {
    for (const action of Object.keys(fields)) fields[action].value = keyLabel(draft[action]);
  };
  for (const [action, title] of Object.entries(KEY_ACTIONS)) {
    const label = document.createElement('label');
    label.textContent = title;
    const field = document.createElement('input');
    field.readOnly = true;
    field.setAttribute('aria-label', `${title} key`);
    field.onkeydown = (event) => {
      if (event.code === 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') { field.blur(); return; }
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (rebind(draft, action, event.code)) refresh();
    };
    fields[action] = field;
    label.append(field);
    grid.append(label);
  }
  refresh();
  const reset = document.createElement('button');
  reset.className = 'secondary-button';
  reset.textContent = 'RESET KEYS';
  reset.onclick = () => { Object.assign(draft, loadBindings()); refresh(); };
  $('controls-done').before(reset);
  $('controls-done').textContent = 'SAVE';
  $("controls-done").onclick = () => {
    settings.bindings = { ...draft };
    applySettings();
    closePanel();
  };
}
$("controls-button").onclick = openControls;
function openSettings() {
  showPanel(
    '<h2>PLAYER</h2><label for="display-name">Name</label><input id="display-name" maxlength="16"><div class="row"><div><label for="jersey-number">Number</label><input id="jersey-number" type="number" min="0" max="99"></div><div><label for="jersey-color">Color</label><input id="jersey-color" type="color"></div></div><button id="settings-save" class="primary">SAVE</button>',
  );
  $("display-name").value = settings.name;
  $("jersey-number").value = settings.number;
  $("jersey-color").value = settings.color;
  const keysButton = document.createElement('button');
  keysButton.className = 'secondary-button';
  keysButton.textContent = 'KEYBINDS';
  $('settings-save').after(keysButton);
  keysButton.onclick = () => { $('settings-save').onclick(); openControls(); };
  $("settings-save").onclick = () => {
    settings.name = $("display-name").value.trim().slice(0, 16) || "YOU";
    settings.number = clamp(Number($("jersey-number").value) || 0, 0, 99);
    settings.color = $("jersey-color").value;
    applySettings();
    closePanel();
  };
}
$("settings-button").onclick = openSettings;
function openOnline() {
  showPanel(
    '<h2>ONLINE 1V1</h2><button id="create-room" class="primary">CREATE ROOM</button><label for="room-input">Room code</label><div class="row"><input id="room-input" placeholder="ABCDE" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false"><button id="join-room" class="secondary-button">JOIN</button></div><p id="online-status" role="status"></p>',
  );
  document.querySelector('#panel-content h2').textContent = mode === 'online2v2' ? 'ONLINE 2V2' : 'ONLINE 1V1';
  const connect = (action) => {
    const code = $("room-input").value.trim().toUpperCase();
    if (action === "join" && !/^[A-Z0-9]{5}$/.test(code)) {
      $("online-status").textContent = "Enter a 5-character room code.";
      return;
    }
    const url = multiplayerURL(location);
    $("online-status").textContent = "Connecting… first time can take a minute.";
    network.connect(
      url,
      action,
      settings.name,
      code,
      mode,
    );
  };
  $("create-room").onclick = () => connect("create");
  $("join-room").onclick = () => connect("join");
  $("room-input").onkeydown = (event) => {
    if (event.key === "Enter") connect("join");
  };
}
function handleNetwork(m) {
  if (m.type === "joined") {
    localId = m.slot;
    if (m.mode) mode = m.mode;
    showPanel(
      '<h2>ROOM CODE</h2><div class="room-code" id="room-code"></div><p id="online-status">Waiting for your friend…</p><button id="copy-room" class="primary">COPY CODE</button><button id="cancel-room" class="secondary-button">CANCEL</button>',
    );
    $("room-code").textContent = m.code;
    $('online-status').textContent = m.capacity === 4 ? `Team ${m.slot%2+1} · waiting for 4 players` : 'Waiting for your friend…';
    $("copy-room").onclick = async () => {
      try {
        await navigator.clipboard.writeText(
          m.code,
        );
        $("online-status").textContent = "Code copied.";
      } catch {
        $("online-status").textContent =
          `Room ${m.code}`;
      }
    };
    $("cancel-room").onclick = () => {
      network.disconnect();
      $("panel").close();
    };
  } else if (m.type === "room") {
    if ($("online-status"))
      $("online-status").textContent =
        m.count === (m.capacity || 2)
          ? "Starting…"
          : `${m.count}/${m.capacity || 2} players · Team ${localId%2+1}`;
  } else if (m.type === "start") {
    mode = m.state.mode;
    game = new GameSimulation(mode);
    game.restore(m.state);
    enterCourt();
    $("p1-label").textContent = isTeam() ? teamLabel(0) : localId === 0 ? settings.name : "OPPONENT";
    $("p2-label").textContent = isTeam() ? teamLabel(1) : localId === 1 ? settings.name : "OPPONENT";
  } else if (m.type === "snapshot") {
    network.reconcile(game, m);
  } else if (m.type === "reconnecting") {
    setBanner("OPPONENT RECONNECTING…", 25);
  } else if (m.type === "reconnected") {
    network.retrySince = null;
    setBanner("BACK ON COURT", 2);
  } else if (m.type === "rematch") {
    const b = $("rematch");
    if (b) b.textContent = "REMATCH REQUESTED…";
  } else if (m.type === "error") {
    if ($("online-status")) $("online-status").textContent = m.message;
    else setBanner(m.message, 5);
  } else if (m.type === "ended") {
    showPanel(
      '<h2>CONNECTION ENDED</h2><p id="ended-message"></p><button id="ended-menu" class="primary">MAIN MENU →</button>',
    );
    $("ended-message").textContent = m.message;
    $("ended-menu").onclick = mainMenu;
    input.enabled = false;
    network.disconnect();
  }
}
function setBanner(text, seconds = 1.4) {
  $("banner").textContent = text;
  bannerUntil = performance.now() + seconds * 1000;
}
function gameOver() {
  gameOverShown = true;
  input.enabled = false;
  const win = game.winner === game.team(localId);
  showPanel(
    `<span class="eyebrow">FINAL SCORE</span><h2>${win ? "YOUR COURT." : "RUN IT BACK."}</h2><div class="final-score">${game.score[0]} <span style="color:#94aab0">—</span> ${game.score[1]}</div><div class="result-stats"><b>PLAYER</b><b>FG</b><b>REB</b><b>STL</b><b>BLK</b>${game.stats.map((s, i) => `<span>${i === localId ? "YOU" : mode === "ai" ? "GOAT" : "OPPONENT"}</span><span>${s.made}/${s.attempts}</span><span>${s.rebounds}</span><span>${s.steals}</span><span>${s.blocks}</span>`).join("")}</div><button id="rematch" class="primary">REMATCH →</button><button id="over-menu" class="secondary-button">MAIN MENU</button>`,
  );
  document.querySelectorAll(".result-stats > span")[localId * 5].textContent = settings.name;
  if (isTeam()) game.players.forEach((p,i) => {
    if (i !== localId) document.querySelectorAll('.result-stats > span')[i*5].textContent =
      `${p.team === game.team(localId) ? 'TEAMMATE' : 'OPPONENT'} ${Math.floor(i/2)+1}`;
  });
  $("rematch").onclick = () => {
    if (isOnline()) {
      network.send({ type: "rematch" });
      $("rematch").textContent = "REMATCH REQUESTED…";
    } else startGame(mode);
  };
  $("over-menu").onclick = mainMenu;
}
function handleEvents() {
  let missed = false;
  for (const e of game.events) {
    if (e.id <= lastEvent) continue;
    lastEvent = e.id;
    audio.play(e.type);
    if (e.type === "miss") missed = true;
    if (e.type === "message") setBanner(e.text);
    if (e.type === "score") {
      const callout = e.points === 2 ? "BANG"
        : e.shotType?.includes('DUNK') ? "THROW IT DOWN"
        : e.distance >= 2.1 && !["LAYUP", "REVERSE LAYUP", "FLOATER"].includes(e.shotType) ? "MONEY"
        : e.swish ? "SWISH" : "BUCKET";
      setBanner(callout, 1.6);
      scene.netPulse = 0.8;
    }
    if (e.type === "shot" && e.perfect) {
      audio.play("perfect");
    }
    if (e.type === "rebound" && e.clear) setBanner("CLEAR", 1.6);
    if (e.type === "steal" || e.type === "block")
      setBanner(e.type === "block" ? "REJECTED" : "STEAL", 1.2);
  }
  if (missed) setBanner("loud ahh brick", 1.6);
}
function updateHud() {
  const p = game.players[localId];
  for (let i = 0; i < 2; i++) {
    const s = isTeam() ? game.teamStats(i) : game.stats[i], label = isTeam() ? teamLabel(i) : i === localId ? (settings.name || "YOU") : mode === "ai" ? "GOAT" : mode === "practice" ? "SOLO" : "OPPONENT";
    $(`stat-name${i}`).textContent = label;
    $(`stat-fg${i}`).textContent = `${s.made}/${s.attempts} · ${s.attempts ? Math.round(s.made / s.attempts * 100) : 0}%`;
    $(`stat-reb${i}`).textContent = s.rebounds;
    $(`stat-stl${i}`).textContent = s.steals;
    $(`stat-blk${i}`).textContent = s.blocks;
  }
  $("score0").textContent = game.score[0];
  $("score1").textContent = game.score[1];
  $("clock").textContent =
    mode === "practice" ? "∞" : Math.max(0, Math.ceil(game.clock));
  $("clock").style.color =
    game.clock < 5 && mode !== "practice" ? "#ffa168" : "";
  $("poss0").hidden = game.team(game.possession) !== 0;
  $("poss1").hidden = game.team(game.possession) !== 1;
  $("stamina-fill").style.width = `${p.stamina}%`;
  $("possession-text").textContent =
    game.ball.owner === localId
      ? game.needsClear
        ? "CLEAR"
        : "YOUR BALL"
      : game.ball.owner === null
        ? "CHASE THE REBOUND"
        : game.team(game.ball.owner) === game.team(localId) ? 'TEAMMATE BALL' : "LOCK IN · DEFENSE";
  $("shot-meter").hidden = !p.charging;
  const ideal = shotTiming(game.shotType(p, { finish: input.selectedFinish }));
  $("meter-tick").style.left = `${clamp((p.charge / C.shotMax) * 100, 0, 99)}%`;
  const timingWindow = releaseWindow(game.distance(p), game.contest(localId), p.stamina, Math.hypot(p.vx,p.vz));
  document.querySelector(".perfect-zone").style.left =
    `${((ideal - timingWindow) / C.shotMax) * 100}%`;
  document.querySelector(".perfect-zone").style.width =
    `${((timingWindow * 2) / C.shotMax) * 100}%`;
  $("shot-context").textContent =
    `${Math.round(game.contest(localId) * 100) > 5 ? Math.round(game.contest(localId) * 100) + "% CONTESTED" : "OPEN"} · ${game.shotType(p, emptyInput())}`;
  if (game.feedback?.until > game.time) {
    const f = game.feedback;
    $("feedback").textContent =
      `${f.label} · ${Math.round(f.contest * 100)}% CONTEST · ${f.type}`;
    $("feedback").style.color = f.perfect ? "#c7f26e" : "#f1d9b7";
  } else $("feedback").textContent = "";
  if (game.state === States.CHECK)
    $("banner").textContent =
      isOnline()
        ? Math.ceil(game.timer) > 0
          ? String(Math.ceil(game.timer))
          : "BALL"
        : game.timer > 0.5
          ? "CHECK BALL"
          : "START";
  else if (performance.now() > bannerUntil) $("banner").textContent = "";
  document.querySelector("[data-action=shoot]").textContent =
    game.ball.owner === localId ? (game.canDunk(p) || p.shotPlan === 'DUNK' ? 'DUNK' : "SHOOT") : "BLOCK";
  $("connection").textContent =
    isOnline()
      ? `${network.connected ? Math.round(network.ping) + " ms · " + (network.ping < 80 ? "GOOD" : "OKAY") : "RECONNECTING"}`
      : "";
  if ($('finish-select').value !== input.selectedFinish) $('finish-select').value = input.selectedFinish;
  if ($('move-select').value !== input.selectedMove) $('move-select').value = input.selectedMove;
  if (game.state === States.OVER && !gameOverShown) gameOver();
  $("debug").hidden = !debug;
  if (debug)
    $("debug").textContent =
      `FPS ${scene.fps.toFixed(0)}\nSTATE ${game.state}\nPLAYER ${p.state}\nAI ${ai.state}\nBALL ${game.ball.owner === null ? "FREE" : "POSSESSED"}\nPOSSESSION ${game.possession}\nLANE ${game.lane(localId)}\nDISTANCE ${game.distance(p).toFixed(2)} m\nCONTEST ${(game.contest(localId) * 100).toFixed(0)}%\nSTAMINA ${p.stamina.toFixed(0)}\nPING ${network.ping} ms\nSNAPSHOT GAP ${(network.loss * 100).toFixed(0)}%`;
}
window.addEventListener("keydown", (e) => {
  if (e.code === "F3") {
    e.preventDefault();
    debug = !debug;
  }
});
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  accumulator += dt;
  while (accumulator >= C.dt) {
    if (playing && !paused) {
      const own = input.enabled ? input.sample(0) : emptyInput();
      if (mode === 'team') {
        if (game.ball.owner !== null && game.team(game.ball.owner) === 0) localId = game.ball.owner;
        else if (own.switchPlayer) {
          const mates = game.players.filter(p => p.team === 0 && p.id !== localId);
          mates.sort((a,b) => Math.hypot(a.x-game.ball.x,a.z-game.ball.z)-Math.hypot(b.x-game.ball.x,b.z-game.ball.z));
          localId = mates[0].id;
          input.clear();
        }
      }
      const inputs = game.players.map(() => emptyInput());
      if (mode === 'team') for (const player of game.players) if (player.id !== localId) inputs[player.id] = teamAI[player.id].sample(game);
      inputs[localId] = own;
      if (mode === "ai") inputs[1] = ai.sample(game);
      if (isOnline()) {
        networkEdge = {
          ...own,
          move: own.move || networkEdge.move,
          steal: own.steal || networkEdge.steal,
          block: own.block || networkEdge.block,
          pass: own.pass || networkEdge.pass,
        };
        networkAccumulator += C.dt;
        if (networkAccumulator >= 1 / C.networkHz) {
          network.submit(networkEdge);
          networkAccumulator = 0;
          networkEdge = emptyInput();
        }
        if (network.connected) game.step(C.dt, inputs);
      } else game.step(C.dt, inputs);
    } else if (!playing) {
      game.players[0].phase += C.dt * 2;
      game.updateHeldBall();
    }
    accumulator -= C.dt;
  }
  if (playing) {
    handleEvents();
    updateHud();
    const phase = Math.floor(game.players[game.ball.owner ?? 0].phase + 0.5);
    if (game.ball.owner !== null && phase !== lastDribble) {
      audio.play("bounce");
      lastDribble = phase;
    }
  }
  scene.update(
    isOnline() && playing ? network.renderState(game) : game,
    dt,
    !playing,
    localId,
  );
  requestAnimationFrame(frame);
}
for (const key of Object.keys(MOVES)) {
  const option = document.createElement('option'); option.value = key; option.textContent = key.toUpperCase();
  $('move-select').append(option);
}
for (const key of FINISHES) {
  const option = document.createElement('option'); option.value = key; option.textContent = key.toUpperCase();
  $('finish-select').append(option);
}
$('move-select').value = input.selectedMove;
$('move-select').onchange = e => { input.selectedMove = e.target.value; e.target.blur(); };
$('finish-select').onchange = e => { input.selectedFinish = e.target.value; e.target.blur(); };
$('stats-toggle').onclick = () => {
  const expanded = document.body.classList.toggle('show-stats');
  $('stats-toggle').setAttribute('aria-expanded', String(expanded));
};
mainMenu();
requestAnimationFrame(frame);
const mc = document.modelContext;
if (mc?.registerTool) {
  try {
    Promise.resolve(
      mc.registerTool({
        name: "start_basketball_game",
        description:
          "Start a basketball match against AI or play solo.",
        inputSchema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["ai", "practice"] },
          },
          required: ["mode"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: ({ mode: next }) => {
          if (!["ai", "practice"].includes(next))
            throw Error("Unsupported local mode");
          startGame(next);
          return { mode: next, state: game.state };
        },
      }),
    ).catch(() => {});
    Promise.resolve(
      mc.registerTool({
        name: "read_basketball_score",
        description: "Read the current basketball score and match state.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          mode,
          state: game.state,
          score: game.score,
          clock: game.clock,
        }),
      }),
    ).catch(() => {});
  } catch {}
}
