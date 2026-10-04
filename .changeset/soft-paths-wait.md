---
"cloudroutes-map": minor
---

- The map now knows which parts of it are covered. The host app draws its own search bar above the WebView, and only the control buttons allowed for it — via a hardcoded 140px — so flying to a stop, framing the network, recentring and popup auto-pan all aimed at the middle of a map that is not all visible and put the answer behind the search bar.
- `MAP_INSET_TOP` lets the host say how much it covers, since it knows its layout and this code does not. Unset, a WebView falls back to the 140px that was hardcoded before and a browser assumes nothing is covering it.
- The drawer is accounted for from below in the same way, measured rather than assumed.
