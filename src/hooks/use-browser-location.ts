import { useEffect } from "react";
import { useLocationStore } from "./use-location-store.ts";

/**
 * Keep the rider's position current in a plain browser.
 *
 * Inside the app the host streams it as `LOCATION_UPDATE`. Opened on the web
 * there is no host, and the position was read once — when a trip was planned
 * — and never again, so Go mode sat on "walk to the stop" however far the
 * rider went. While a trip is open the browser is asked to follow them.
 */
export function useBrowserLocation(active: boolean) {
  const setHere = useLocationStore((state) => state.setHere);

  useEffect(() => {
    if (!active || window.ReactNativeWebView || !("geolocation" in navigator)) return;

    const id = navigator.geolocation.watchPosition(
      (position) => setHere([position.coords.latitude, position.coords.longitude]),
      () => {
        /* Refused or unavailable: the last known position stands. */
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [active, setHere]);
}
