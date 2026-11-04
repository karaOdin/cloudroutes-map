import { useEffect, useRef } from "react";
import { Marker } from "react-leaflet";
import { Marker as LeafletMarker } from "leaflet";
import { busStopIconFor } from "../icons.ts";

type StopMarkerProps = {
  stop: {
    id: number;
    title: string;
    coordinate: [number, number];
    lines: Array<{ name: string; color: string }>;
  };
  dimmed: boolean;
  /** True while this is the stop the map was asked to show. */
  highlighted: boolean;
  onClick: () => void;
};

/**
 * One stop.
 *
 * Extracted from the layer so a single stop can be called out without
 * rebuilding anyone's icon: the highlight is a class and a custom property set
 * on the live element, which leaves the per-colour icon cache intact.
 */
export function StopMarker({
  stop,
  dimmed,
  highlighted,
  onClick,
}: StopMarkerProps) {
  const markerRef = useRef<LeafletMarker>(null);

  useEffect(() => {
    const element = markerRef.current?.getElement();

    if (!element) return;

    element.classList.toggle("is-highlighted", highlighted);
    // The name rides along as a property so the callout can show which stop
    // this is without the icon markup differing per stop.
    element.style.setProperty("--stop-name", JSON.stringify(stop.title));
  }, [highlighted, stop.title]);

  // A called-out stop must sit above its neighbours, or its ring is clipped by
  // whatever happens to be drawn after it.
  useEffect(() => {
    markerRef.current?.setZIndexOffset(highlighted ? 900 : 0);
  }, [highlighted]);

  return (
    <Marker
      ref={markerRef}
      position={stop.coordinate}
      icon={busStopIconFor(stop.lines)}
      title={stop.title}
      opacity={dimmed ? 0.2 : 1}
      eventHandlers={{ click: onClick }}
    />
  );
}
