export const hostedServer = "wss://baskemtbal-multiplayer.onrender.com/ws";

export function multiplayerURL(location) {
  const local = location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    /^192\.168\./.test(location.hostname) ||
    /^10\./.test(location.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname);
  return local
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
    : hostedServer;
}
