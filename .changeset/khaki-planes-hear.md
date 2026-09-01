---
"cloudroutes-map": minor
---

- Added `scripts/gps-probe.mjs`, a read-only probe that subscribes to the live Traccar feed and reports reporting cadence, fleet staleness, distance from route lines, jump sizes and which Traccar fields are actually populated. The map's timing constants are now set from measurement rather than assumption.
- Fixed socket position updates copying only latitude, longitude and course. `fixTime` stayed frozen at whatever the initial HTTP snapshot said, so on a healthy socket every vehicle aged into "stale" after five minutes and stopped being drawn at thirty while reporting normally. Measured over a 150s capture the apparent fix age was 157s and climbing, against 13s after the fix.
- Fixed position updates being silently dropped. The handler closed over `positions.data` from the last render and wrote the whole array back; replaying the real feed, 13-22% of messages arrived closer together than a React re-render and clobbered the update before them. Cache writes are now functional.
- The socket subscription is now registered once for the session instead of being torn down and re-added on every message.
- Device events are applied instead of discarded. They were 55% of socket traffic and carried tracker status and any vehicle missing from the initial snapshot.
- Added a silence watchdog: a socket can sit in readyState OPEN and deliver nothing. Measured message gaps have a 2.4s maximum, so a minute of silence is treated as a dead feed, which both starts the HTTP fallback and forces a reconnect.
- Fallback polling tightened from 20s to 12s, just above the measured 9.8s median reporting interval.
