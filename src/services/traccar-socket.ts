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

/**
 * A socket can sit in readyState OPEN and deliver nothing — the server stops
 * pushing, or a middlebox holds a dead connection open. Nothing about the
 * socket itself reveals that, so silence has to be timed.
 *
 * Measured against the live feed, messages arrive a median of 120ms apart and
 * the largest observed gap was 2.4s, so a minute of silence is roughly 25x
 * anything normal and is safe to treat as a dead feed.
 */
const SILENCE_TIMEOUT_MS = 60_000;
const SILENCE_CHECK_MS = 15_000;

/**
 * How many times to fail before concluding this server has no usable socket
 * for us, rather than that the network is having a bad moment.
 *
 * Traccar 4 authenticates its socket by session cookie only — `?token=` in the
 * query answers 503 — and that cookie comes back without a SameSite attribute,
 * which browsers treat as Lax and will not send on a cross-site handshake. The
 * app is served from a different origin to Traccar, so on those tenants the
 * socket can never open, however many times it is tried. Verified in a real
 * browser against a 4.14 server: refused with the token, refused after a
 * successful credentialed /session, refused with both.
 *
 * Retrying forever there costs a TLS handshake every 30s for nothing. Giving
 * up leaves the HTTP fallback as the live channel, which works on every
 * version. A foreground or `online` event still tries again, since it costs
 * little and conditions may genuinely have changed.
 */
const GIVE_UP_AFTER_FAILURES = 4;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let connected = false;
let lastMessageAt = 0;
let everOpened = false;
let unusable = false;

function setConnected(next: boolean) {
  if (connected === next) return;

  connected = next;
  statusListeners.forEach((listener) => listener(next));
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);

  // Never opened, and has failed enough times to mean it: this server has no
  // socket we can use. Stop, and let the HTTP fallback carry the feed.
  if (!everOpened && attempts >= GIVE_UP_AFTER_FAILURES) {
    unusable = true;

    return;
  }

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
    everOpened = true;
    lastMessageAt = Date.now();
    setConnected(true);
  });

  socket.addEventListener("message", (event) => {
    lastMessageAt = Date.now();

    // An open socket that had gone quiet and has now spoken is live again.
    if (!connected) setConnected(true);

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

/** Reconnect now rather than waiting out the backoff, and try a server we
 *  had written off — coming back to the foreground is cheap enough to retry. */
function reconnectImmediately() {
  attempts = 0;
  unusable = false;
  connect();
}

/**
 * Treat a silent socket as disconnected. That both starts the HTTP fallback —
 * consumers poll while this reports disconnected — and tears the socket down
 * so the normal reconnect path can replace it.
 */
function checkForSilence() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  if (Date.now() - lastMessageAt < SILENCE_TIMEOUT_MS) return;

  setConnected(false);
  socket.close();
}

if (typeof setInterval !== "undefined") {
  setInterval(checkForSilence, SILENCE_CHECK_MS);
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

/** True only while the socket is open and has spoken recently. */
export function isSocketConnected(): boolean {
  return connected;
}

/**
 * True once this server has been judged to have no socket we can open — a
 * Traccar 4 backend, in practice. Consumers use it to say the live feed is
 * polling rather than pushing, instead of implying it is merely reconnecting.
 */
export function isSocketUnusable(): boolean {
  return unusable;
}
