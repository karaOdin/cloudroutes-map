---
"cloudroutes-map": patch
---

- Fixed most of the fleet showing an "awaiting fix" ring at any moment. The ring fired at 1.5x the single previous interval, but the feed's intervals run 4.6s to 31.8s around a 9.8s median, so ordinary jitter read as lateness — replaying the live feed it fired on 20% of intervals. The expected cadence is now a smoothed average that ignores Traccar's back-to-back duplicates, with a 20s floor so the ring means overdue rather than irregular. Same capture: 3.9%.
- Device events no longer re-render every marker twice a second. They arrive at ~2/s and almost always differ only in `lastUpdate`, which nothing on the map reads, so the cache is replaced only when a field the UI uses has changed.
- Added per-session jitter to the fallback poll, so a feed outage does not put every client on the same 12s beat against the same endpoint.
