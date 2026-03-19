// src/worker.ts
var WS_URL = "ws://127.0.0.1:3030/browser/ws";
var RECONNECT_BASE_MS = 500;
var RECONNECT_MAX_MS = 5000;
var socket = null;
var reconnectDelay = RECONNECT_BASE_MS;
var reconnectTimer = null;
function connect() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
    return;
  }
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  socket.onopen = () => {
    console.log("[screenpipe] connected to", WS_URL);
    reconnectDelay = RECONNECT_BASE_MS;
    const hello = {
      type: "hello",
      from: "extension",
      browser: detectBrowser(),
      version: chrome.runtime.getManifest().version
    };
    send(hello);
  };
  socket.onclose = () => scheduleReconnect();
  socket.onerror = () => {
    try {
      socket?.close();
    } catch {}
  };
  socket.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.action === "ping") {
      send({ type: "pong" });
      return;
    }
    if (msg.action === "eval") {
      const { id, code, url } = msg;
      try {
        const tabId = await findTab(url);
        const result = await evalInTab(tabId, code);
        send({ id, ok: true, result });
      } catch (err) {
        send({ id, ok: false, error: err?.message ?? String(err) });
      }
    }
  };
}
function scheduleReconnect() {
  if (reconnectTimer)
    return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    connect();
  }, reconnectDelay);
}
function send(obj) {
  try {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    }
  } catch {}
}
async function findTab(urlPattern) {
  if (urlPattern) {
    const tabs = await chrome.tabs.query({});
    const match = tabs.find((t) => t.url?.includes(urlPattern));
    if (match?.id != null)
      return match.id;
  }
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id != null)
    return active.id;
  throw new Error("no matching tab found");
}
async function evalInTab(tabId, code) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.includes("chromewebstore.google.com")) {
    throw new Error(`cannot execute scripts on ${tab.url}`);
  }
  const needsReturn = !code.includes("return ") && !code.includes(`return
`) && !code.trimStart().startsWith("{");
  const wrappedCode = needsReturn ? `return (${code})` : code;
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (userCode) => {
      const fn = new Function(userCode);
      const result = fn();
      return result instanceof Promise ? await result : result;
    },
    args: [wrappedCode]
  });
  if (frame?.result !== undefined)
    return frame.result;
  return null;
}
function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/"))
    return "edge";
  if (ua.includes("Brave/"))
    return "brave";
  if (ua.includes("OPR/") || ua.includes("Opera/"))
    return "opera";
  if (ua.includes("Chrome/"))
    return "chrome";
  if (ua.includes("Firefox/"))
    return "firefox";
  return "unknown";
}
chrome.alarms.create("screenpipe_keepalive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "screenpipe_keepalive")
    connect();
});
chrome.tabs.onActivated.addListener(() => connect());
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.status === "complete")
    connect();
});
connect();
