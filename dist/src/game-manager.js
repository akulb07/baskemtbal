import { SceneManager } from "./rendering.js";
import { GameSimulation } from "./simulation.js";
import { InputManager, DEFAULT_KEYS } from "./input.js";
import { AIInputController } from "./ai.js";
import { AudioManager } from "./audio.js";
import { NetworkManager } from "./network.js";
import { C, emptyInput, clamp, States } from "./config.js";
const $ = (id) => document.getElementById(id);
const defaults = {
  volume: 0.45,
  quality: "auto",
  difficulty: "pro",
  vibration: true,
  color: "#e9974f",
  number: 23,
  name: "YOU",
  camera: 1,
  bindings: DEFAULT_KEYS,
  server: "",
};
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("afterhours-settings") || "{}");
} catch {}
let settings = { ...defaults, ...saved };
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
  scene.setQuality(settings.quality);
  scene.customize(settings);
  $("loading").hidden = true;
} catch (e) {
  $("load-status").textContent =
    "WebGL could not start. Enable hardware acceleration and reload.";
  console.error(e);
  throw e;
}
const input = new InputManager((background) => pauseGame(background));
input.bindings = settings.bindings || structuredClone(DEFAULT_KEYS);
const network = new NetworkManager(handleNetwork);
function applySettings() {
  audio.volume = Number(settings.volume);
  scene.setQuality(settings.quality);
  scene.customize(settings);
  input.bindings = settings.bindings;
  saveSettings();
}
applySettings();
function selectMode(next) {
  if (!["ai", "local", "online", "practice"].includes(next))
    throw Error("Unknown mode");
  mode = next;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.mode === mode));
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
  input.clear();
  input.enabled = true;
  document.body.classList.add("playing");
  $("hud").hidden = false;
  $("panel").close();
  $("p1-label").textContent =
    mode === "local" ? "PLAYER 1" : settings.name || "YOU";
  $("p2-label").textContent =
    mode === "ai" ? "RIVAL" : mode === "practice" ? "PRACTICE" : "PLAYER 2";
  $("feedback").textContent = "";
  $("banner").textContent = "";
  audio.unlock();
}
function startGame(next = mode) {
  selectMode(next);
  if (mode === "online") {
    openOnline();
    return;
  }
  network.disconnect();
  localId = 0;
  game = new GameSimulation(mode);
  ai = new AIInputController(1, settings.difficulty);
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
  if (mode === 'online' && !playing) network.disconnect();
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
  if (mode === "online") {
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
    '<span class="eyebrow">TAKE A BREATHER</span><h2>TIME OUT.</h2><p>Your court will be right here.</p><button id="resume-game" class="primary">BACK TO THE GAME →</button><button id="pause-controls" class="secondary-button">HOW TO PLAY</button><button id="restart-game" class="secondary-button">RESTART MATCH</button><button id="leave-game" class="secondary-button">MAIN MENU</button>',
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
    '<span class="eyebrow">THE FUNDAMENTALS</span><h2>MAKE YOUR MOVE.</h2><p>Hold shoot, then release in the green. A quick tap pump fakes. Drive close to the rim for a layup or an open dunk. After a defensive rebound, take the ball beyond the arc.</p><div class="control-grid"><div><h3>PLAYER 1</h3><span>WASD</span> · Move<br><span>Left Shift</span> · Sprint<br><span>Space</span> · Shoot / fake<br><span>C / Q</span> · Cross / combo<br><span>X</span> · Step back<br><span>E</span> · Steal<br><span>F</span> · Defend + jump<br><span>B + Space</span> · Bank shot</div><div><h3>PLAYER 2</h3><span>Arrow keys</span> · Move<br><span>Right Shift</span> · Sprint<br><span>Enter</span> · Shoot / fake<br><span>, / /</span> · Cross / combo<br><span>M</span> · Step back<br><span>.</span> · Steal<br><span>L</span> · Defend + jump<br><span>N + Enter</span> · Bank shot</div></div><h3>TOUCH CONTROLS</h3><p>Drag the left stick to move. Hold DRIVE to sprint; double tap for a burst. Tap MOVE to cross, swipe left/right for behind-the-back/between-the-legs, down to step back, up to spin. Hold SHOOT and release in the green; tap DEFEND to jump and reach, then hold to slide. SHOOT becomes BLOCK on defense.</p><p>Q cycles between-the-legs, behind-the-back, hesitation, spin, and in-and-out. Moves cost stamina. A green release is strongest when balanced and open.</p><button id="controls-done" class="primary">GOT IT →</button>',
  );
  $("controls-done").onclick = closePanel;
}
$("controls-button").onclick = openControls;
function openSettings() {
  showPanel(
    '<span class="eyebrow">YOUR GAME, YOUR WAY</span><h2>SETTINGS</h2><div class="row"><div><label for="difficulty">AI difficulty</label><select id="difficulty"><option value="rookie">Rookie</option><option value="pro">Pro</option><option value="allstar">All-Star</option><option value="elite">Elite</option></select></div><div><label for="quality">Graphics</label><select id="quality"><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></div><label for="volume">Sound volume</label><input id="volume" type="range" min="0" max="1" step=".05"><div class="row"><div><label for="display-name">Display name</label><input id="display-name" maxlength="16"></div><div><label for="jersey-number">Jersey number</label><input id="jersey-number" type="number" min="0" max="99"></div><div><label for="jersey-color">Jersey color</label><input id="jersey-color" type="color"></div></div><label><input id="vibration" type="checkbox"> Touch vibration</label><button id="rebind" class="secondary-button">CUSTOMIZE KEYBOARD CONTROLS</button><button id="settings-save" class="primary">SAVE SETTINGS →</button>',
  );
  $("difficulty").value = settings.difficulty;
  $("quality").value = settings.quality;
  $("volume").value = settings.volume;
  $("display-name").value = settings.name;
  $("jersey-number").value = settings.number;
  $("jersey-color").value = settings.color;
  $("vibration").checked = settings.vibration;
  $("settings-save").onclick = () => {
    Object.assign(settings, {
      difficulty: $("difficulty").value,
      quality: $("quality").value,
      volume: Number($("volume").value),
      name: $("display-name").value.trim() || "YOU",
      number: clamp(Number($("jersey-number").value) || 0, 0, 99),
      color: $("jersey-color").value,
      vibration: $("vibration").checked,
    });
    applySettings();
    closePanel();
  };
  $("rebind").onclick = openBindings;
}
function openBindings() {
  showPanel(
    '<span class="eyebrow">KEYBOARD</span><h2>YOUR CONTROLS</h2><p>Select a key, then press its replacement. Escape is reserved for pause. Avoid duplicate keys.</p><div id="binding-grid" class="control-grid"></div><button id="bindings-reset" class="secondary-button">RESTORE DEFAULTS</button><button id="bindings-done" class="primary">SAVE CONTROLS →</button>',
  );
  for (let id = 0; id < 2; id++) {
    const col = document.createElement("div");
    const h = document.createElement("h3");
    h.textContent = `PLAYER ${id + 1}`;
    col.append(h);
    for (const [action, key] of Object.entries(settings.bindings[id])) {
      const button = document.createElement("button");
      button.className = "secondary-button";
      button.textContent = `${action}: ${key.replace("Key", "")}`;
      button.style.fontSize = "12px";
      button.style.padding = "7px";
      button.onclick = () => {
        button.textContent = "Press a key…";
        const capture = (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (e.code !== "Escape") {
            const duplicate = settings.bindings.some((b, j) =>
              Object.entries(b).some(
                ([a, k]) => k === e.code && !(id === j && a === action),
              ),
            );
            if (duplicate) {
              button.textContent = "Already used — choose another";
              return;
            }
            settings.bindings[id][action] = e.code;
            button.textContent = `${action}: ${e.code.replace("Key", "")}`;
          }
          window.removeEventListener("keydown", capture, true);
        };
        window.addEventListener("keydown", capture, true);
      };
      col.append(button);
    }
    $("binding-grid").append(col);
  }
  $("bindings-reset").onclick = () => {
    settings.bindings = structuredClone(DEFAULT_KEYS);
    openBindings();
  };
  $("bindings-done").onclick = () => {
    applySettings();
    openSettings();
  };
}
$("settings-button").onclick = openSettings;
$("sound").onclick = () => {
  audio.unlock();
  audio.enabled = !audio.enabled;
  $("sound").textContent = audio.enabled ? "♪" : "×";
  $("sound").setAttribute(
    "aria-label",
    audio.enabled ? "Mute sound" : "Enable sound",
  );
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    showPanel(
      "<h2>FULLSCREEN</h2><p>This browser does not support fullscreen here. You can still play in this window.</p>",
    );
  }
};
function openOnline() {
  const defaultURL = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
    : "";
  showPanel(
    '<span class="eyebrow">BRING YOUR RIVAL</span><h2>ONLINE 1V1</h2><p>Connect both players to the same game server, then share a private room code or join the quick-match queue.</p><label for="server-url">Game server address</label><input id="server-url" placeholder="wss://your-game-server.example/ws" autocomplete="url"><p class="server-help">The downloadable project includes the multiplayer server. On a local network, use the host computer’s address with port 4173.</p><div class="row"><button id="quick-match" class="primary">QUICK MATCH</button><button id="create-room" class="primary">PRIVATE ROOM</button></div><label for="room-input">Have a room code?</label><div class="row"><input id="room-input" placeholder="ABCDE" maxlength="5" autocapitalize="characters"><button id="join-room" class="secondary-button">JOIN ROOM</button></div><p id="online-status" role="status"></p>',
  );
  $("server-url").value = settings.server || defaultURL;
  const connect = (action) => {
    const url = $("server-url").value.trim();
    try {
      const parsed = new URL(url);
      if (!["ws:", "wss:"].includes(parsed.protocol)) throw Error();
      if (location.protocol === "https:" && parsed.protocol === "ws:") {
        $("online-status").textContent =
          "This secure page needs a wss:// server. For a local network, open the game directly from the host computer.";
        return;
      }
    } catch {
      $("online-status").textContent =
        "Enter the address of a running multiplayer server.";
      return;
    }
    settings.server = url;
    saveSettings();
    $("online-status").textContent = "Connecting to the court…";
    network.connect(
      url,
      action,
      settings.name,
      $("room-input").value.trim().toUpperCase(),
    );
  };
  $("quick-match").onclick = () => connect("quick");
  $("create-room").onclick = () => connect("create");
  $("join-room").onclick = () => connect("join");
}
function handleNetwork(m) {
  if (m.type === "joined") {
    localId = m.slot;
    showPanel(
      '<span class="eyebrow">PRIVATE COURT</span><h2>YOU’RE UP NEXT.</h2><p>Share this room code and server address with your friend.</p><div class="room-code" id="room-code"></div><p id="online-status">Waiting for another player…</p><button id="copy-room" class="primary">COPY INVITE →</button><button id="cancel-room" class="secondary-button">CANCEL</button>',
    );
    $("room-code").textContent = m.code;
    $("copy-room").onclick = async () => {
      try {
        await navigator.clipboard.writeText(
          `Afterhours room: ${m.code}\nServer: ${network.url}`,
        );
        $("online-status").textContent = "Invite copied.";
      } catch {
        $("online-status").textContent =
          `Room ${m.code}. Server: ${network.url}`;
      }
    };
    $("cancel-room").onclick = () => {
      network.disconnect();
      $("panel").close();
    };
  } else if (m.type === "room") {
    if ($("online-status"))
      $("online-status").textContent =
        m.count === 2
          ? "Both players connected. Preparing tip-off…"
          : "Waiting for another player…";
  } else if (m.type === "start") {
    mode = "online";
    game = new GameSimulation("online");
    game.restore(m.state);
    enterCourt();
    $("p1-label").textContent = localId === 0 ? "YOU" : "OPPONENT";
    $("p2-label").textContent = localId === 1 ? "YOU" : "OPPONENT";
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
  const win = game.winner === localId;
  showPanel(
    `<span class="eyebrow">FINAL SCORE</span><h2>${mode === "local" ? `PLAYER ${game.winner + 1} WINS.` : win ? "YOUR COURT." : "RUN IT BACK."}</h2><div class="final-score">${game.score[0]} <span style="color:#94aab0">—</span> ${game.score[1]}</div><p>${game.stats[localId].made} / ${game.stats[localId].attempts} field goals · ${game.stats[localId].rebounds} rebounds · ${game.stats[localId].blocks} blocks</p><button id="rematch" class="primary">REMATCH →</button><button id="over-menu" class="secondary-button">MAIN MENU</button>`,
  );
  $("rematch").onclick = () => {
    if (mode === "online") {
      network.send({ type: "rematch" });
      $("rematch").textContent = "REMATCH REQUESTED…";
    } else startGame(mode);
  };
  $("over-menu").onclick = mainMenu;
}
function handleEvents() {
  for (const e of game.events) {
    if (e.id <= lastEvent) continue;
    lastEvent = e.id;
    audio.play(e.type);
    if (e.type === "message") setBanner(e.text);
    if (e.type === "score") {
      setBanner(`+${e.points} ${e.swish ? "SWISH" : "BUCKET"}`, 1.6);
      scene.netPulse = 0.8;
    }
    if (e.type === "shot" && e.perfect) {
      audio.play("perfect");
      if (settings.vibration) navigator.vibrate?.(20);
    }
    if (e.type === "rebound" && e.clear) setBanner("CLEAR BEYOND THE ARC", 1.6);
    if (["score", "steal", "block"].includes(e.type) && settings.vibration)
      navigator.vibrate?.(25);
    if (e.type === "steal" || e.type === "block")
      setBanner(e.type.toUpperCase(), 1.2);
  }
}
function updateHud() {
  const p = game.players[localId];
  $("score0").textContent = game.score[0];
  $("score1").textContent = game.score[1];
  $("clock").textContent =
    mode === "practice" ? "∞" : Math.max(0, Math.ceil(game.clock));
  $("clock").style.color =
    game.clock < 5 && mode !== "practice" ? "#ffa168" : "";
  $("poss0").hidden = game.possession !== 0;
  $("poss1").hidden = game.possession !== 1;
  $("stamina-fill").style.width = `${p.stamina}%`;
  $("possession-text").textContent =
    game.ball.owner === localId
      ? game.needsClear
        ? "CLEAR THE BALL"
        : "YOUR BALL"
      : game.ball.owner === null
        ? "CHASE THE REBOUND"
        : "LOCK IN · DEFENSE";
  $("shot-meter").hidden = !p.charging;
  const ideal = p.shotPlan === 'DUNK' || game.distance(p) < 2.1 ? 0.53 : 0.68;
  $("meter-tick").style.left = `${clamp((p.charge / C.shotMax) * 100, 0, 99)}%`;
  const timingWindow = C.perfectWindow * (1 - .35 * game.contest(localId)) * (p.stamina < 25 ? .8 : 1);
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
      mode === "online"
        ? Math.ceil(game.timer) > 0
          ? String(Math.ceil(game.timer))
          : "BALL"
        : game.timer > 0.5
          ? "CHECK BALL"
          : "BALL IN";
  else if (performance.now() > bannerUntil) $("banner").textContent = "";
  document.querySelector("[data-action=shoot]").textContent =
    game.ball.owner === localId ? (game.canDunk(p) || p.shotPlan === 'DUNK' ? 'DUNK' : "SHOOT") : "BLOCK";
  $("connection").textContent =
    mode === "online"
      ? `${network.connected ? Math.round(network.ping) + " ms · " + (network.ping < 80 ? "GOOD" : "OKAY") : "RECONNECTING"}`
      : "";
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
      const inputs = [emptyInput(), emptyInput()];
      inputs[localId] = own;
      if (mode === "local") inputs[1] = input.sample(1);
      else if (mode === "ai") inputs[1] = ai.sample(game);
      if (mode === "online") {
        networkEdge = {
          ...own,
          move: own.move || networkEdge.move,
          steal: own.steal || networkEdge.steal,
          block: own.block || networkEdge.block,
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
    mode === "online" && playing ? network.renderState(game) : game,
    dt,
    !playing,
    localId,
  );
  requestAnimationFrame(frame);
}
mainMenu();
requestAnimationFrame(frame);
const mc = document.modelContext;
if (mc?.registerTool) {
  try {
    Promise.resolve(
      mc.registerTool({
        name: "start_basketball_game",
        description:
          "Start a local basketball match against AI, two-player keyboard match, or free practice.",
        inputSchema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["ai", "local", "practice"] },
          },
          required: ["mode"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: ({ mode: next }) => {
          if (!["ai", "local", "practice"].includes(next))
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
