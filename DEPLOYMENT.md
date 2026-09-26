# Deployment options

The static client can be served from any static web host. Its `dist/` directory includes Three.js locally, with no CDN requirement for game code. `dist/index.html` is the entry point.

For all four modes from one origin, deploy the included Node process to a host with persistent WebSocket support:

```sh
npm ci
npm run build
PORT=4173 npm start
```

Set the port through your hosting dashboard on platforms that supply it automatically. On Windows PowerShell, use `$env:PORT='4173'; npm start`.

Route both HTTP assets and `/ws` to that process. Terminate TLS at the hosting platform so clients use HTTPS and WSS. Rooms are held in one process, so use one instance or session affinity until room routing is added. Do not place `/ws` behind a proxy that drops WebSocket upgrades.

The private Sites URL is the static client only. Enter the separate WSS address on the Online screen to use that client with an Internet server. Same-Wi-Fi play is available by opening the Node server's LAN URL on both devices.

The README documents tests, controls, AI tuning, networking limits, and the remaining real-device acceptance checks.
