import { Env } from "../config/env.ts";

/**
 * Traccar position feed.
 *
 * Replaces a bare module-scope `new WebSocket(...)` that was created once at
 * import time and never reopened. Traccar drops idle sockets, mobile networks
 * drop everything, and a backgrounded WebView has its socket killed outright —
 * after any of those the feed went silent for the rest of the session with no
 * error surfaced, which is why vehicles appeared to stop moving and then jump
 * a long way once something else forced a refetch.
 *
 * This reconnects with backoff, and immediately on the two events that matter
 * on a phone: coming back to the foreground, and regaining connectivity.
 */

type MessageListener = (event: MessageEvent<string>) => void;
type StatusListener = (connected: boolean) => void;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let connected = false;

function setConnected(next: boolean) {
  if (connected === next) return;

  connected = next;
  statusListeners.forEach((listener) => listener(next));
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);

  const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);

  attempts += 1;
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  if (!Env.TRACCAR_WS_URL || !Env.TRACCAR_TOKEN) return;

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  clearTimeout(reconnectTimer);

  try {
    socket = new WebSocket(
      `${Env.TRACCAR_WS_URL}?token=${Env.TRACCAR_TOKEN}`
    );
  } catch {
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    attempts = 0;
    setConnected(true);
  });

  socket.addEventListener("message", (event) => {
    messageListeners.forEach((listener) =>
      listener(event as MessageEvent<string>)
    );
  });

  socket.addEventListener("close", () => {
    setConnected(false);
    scheduleReconnect();
  });

  // An error is always followed by a close, which is where reconnect is
  // scheduled; closing here just makes that happen promptly.
  socket.addEventListener("error", () => socket?.close());
}

/** Reconnect now rather than waiting out the backoff. */
function reconnectImmediately() {
  attempts = 0;
  connect();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconnectImmediately();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", reconnectImmediately);
}

connect();

export function subscribeToPositionMessages(listener: MessageListener) {
  messageListeners.add(listener);

  return () => {
    messageListeners.delete(listener);
  };
}

export function subscribeToSocketStatus(listener: StatusListener) {
  statusListeners.add(listener);

  return () => {
    statusListeners.delete(listener);
  };
}

export function isSocketConnected(): boolean {
  return connected;
}
