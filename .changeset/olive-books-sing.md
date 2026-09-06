---
"cloudroutes-map": minor
---

- The live feed can now be supplied by the React Native host instead of opened in the page. Traccar authenticates its socket by session cookie alone, and on Traccar 4 that cookie arrives without a `SameSite` attribute — Chrome reports `SameSiteUnspecifiedTreatedAsLax` and refuses to store it, so a WebView can never send it cross-site. React Native is not a browser and can set the `Cookie` header directly, so the host can hold the socket and forward each frame in as `{ type: "TRACCAR_MESSAGE", data }`. Accepted on both `window` and `document`, and the first bridged frame closes any socket the page opened itself so the two never compete.
