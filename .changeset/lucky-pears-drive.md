---
"cloudroutes-map": minor
---

- Fixed the Traccar position feed going permanently silent. The WebSocket was constructed once at module scope with no `close` or `error` handling and was never reopened, so any drop — an idle timeout, a network blip, or Android suspending a backgrounded WebView — froze every vehicle for the rest of the session. It now reconnects with backoff, and immediately when the app returns to the foreground or regains connectivity.
- Added an HTTP fallback that polls positions every 20s only while the socket is down, so a dead feed degrades instead of stopping.
- Vehicles now slide between fixes instead of teleporting. This needed the icon to stop being rebuilt per heading (which made react-leaflet replace the marker element on every update), markers to stop being keyed by their coordinates (which remounted them on every update), and marker transitions to be suppressed during zoom.
