/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import "./App.css";
import "./i18n/index.ts";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  Polyline,
  Popup,
} from "react-leaflet";
import { LineMarkers } from "./components/LineMarkers.tsx";
import { createClientApi } from "@cloudroutes/query";
import { Env } from "./config/env.ts";
import { initTraccarClient } from "./helpers.ts";
import { DevicePositionMarkers } from "./components/BusMarkers";
import { BusStopsMarkers } from "./components/BusStopsMarkers.tsx";
import Modal from "react-modal";
import { useEffect, useRef, useState } from "react";
import { Filters } from "./components/Filters.tsx";
import { useDefaultLocation } from "@cloudroutes/query/lines";
import clsx from "clsx";
import { userIcon } from "./icons.ts";
import { useGlobalStore } from "./store";
import { useTranslation } from "react-i18next";
import { LatLngExpression } from "leaflet";
import L from "leaflet";

createClientApi({
  baseURL: Env.API_URL,
});

initTraccarClient().catch((e) => console.error("ERROR:", e));

Modal.setAppElement("#root");

const isLineDisabled = window?.env?.LINE_IS_DISABLED ?? false;

// Extend window type for React Native communication
declare global {
  interface Window {
    env?: {
      API_URL?: string;
      TRACCAR_URL?: string;
      TRACCAR_WS_URL?: string;
      TRACCAR_TOKEN?: string;
      LINE_IS_DISABLED?: boolean;
    };
    language?: string;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

// Route data types
type RouteStep = {
  action: string;
  type?: string;
  line?: string;
  at?: string;
  to?: string;
  from?: string;
  stops?: number;
  polyline?: LatLngExpression[];
  color?: string;
  stops_between?: string[];
  duration?: number;
  distance?: number;
  location?: LatLngExpression;
};

type RouteData = {
  success: boolean;
  type: string;
  summary: string;
  total_time: number;
  total_price: number;
  total_distance: number;
  steps: RouteStep[];
  metadata?: {
    transfers?: number;
    lines_used?: string[];
    total_stops?: number;
    warning?: string | null;
  };
};

// Custom marker icons for different stop types - Small dots like Google Maps
const createStopIcon = (
  action: "board" | "arrive" | "transfer" | "travel" | "walk",
  stopName?: string,
  lineColor?: string
): L.DivIcon => {
  // For regular/intermediate stops, use small dots like Google Maps
  if (action === "travel") {
    const dotColor = lineColor || "#06b6d4";
    return L.divIcon({
      className: "custom-bus-stop-icon",
      html: `
        <div style="
          width: 10px;
          height: 10px;
          background: ${dotColor};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        " title="${stopName || ""}"></div>
      `,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
      popupAnchor: [0, -5],
    });
  }

  // For special stops, use meaningful icons
  let bgColor = "#06b6d4";
  const borderColor = "white";
  let size = 40;
  let borderWidth = 4;
  let iconSvg = "";

  switch (action) {
    case "walk":
      bgColor = "#6B7280"; // Gray for walk/current location
      size = 36;
      borderWidth = 3;
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="4" r="2" fill="white"/>
          <path d="M13.5 7h-3l-1 4 2.5 2v7h2v-6l-1.5-2 .5-2 1.5 1.5V15h2V10l-2-2-.5-1z" fill="white"/>
        </svg>
      `;
      break;
    case "board":
      bgColor = "#10b981"; // Green for start
      iconSvg = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="8" stroke="white" stroke-width="2.5" fill="none"/>
          <circle cx="12" cy="12" r="3" fill="white"/>
        </svg>
      `;
      break;
    case "arrive":
      bgColor = "#ef4444"; // Red for end
      iconSvg = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/>
          <circle cx="12" cy="9" r="2.5" fill="${bgColor}"/>
        </svg>
      `;
      break;
    case "transfer":
      bgColor = "#f59e0b"; // Orange for transfer
      size = 36;
      borderWidth = 3;
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 10l3-3m0 0L7 4m3 3H4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M17 14l-3 3m0 0l3 3m-3-3h6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      break;
  }

  return L.divIcon({
    className: "custom-stop-icon",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${bgColor};
        border: ${borderWidth}px solid ${borderColor};
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        position: relative;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      " title="${stopName || ""}">
        ${iconSvg}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 5],
  });
};

// Line label icon (like Google Maps "19F", "30D" badges)
const createLineLabelIcon = (lineName: string, color: string): L.DivIcon => {
  return L.divIcon({
    className: "line-label-icon",
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: white;
        color: ${color || "#06b6d4"};
        padding: 4px 10px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 11px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        white-space: nowrap;
        border: 2px solid ${color || "#06b6d4"};
        transform: translateX(-50%);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${color || "#06b6d4"}">
          <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 15c-.83 0-1.5-.67-1.5-1.5S6.67 12 7.5 12s1.5.67 1.5 1.5S8.33 15 7.5 15zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 10H6V6h12v4z"/>
        </svg>
        ${lineName}
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// Get all stops from route data with their types
const getAllStopsFromRoute = (
  routeData: RouteData
): Array<{
  location: LatLngExpression;
  action: "board" | "arrive" | "transfer" | "travel" | "walk";
  name: string;
  line?: string;
  color?: string;
}> => {
  const stops: Array<{
    location: LatLngExpression;
    action: "board" | "arrive" | "transfer" | "travel" | "walk";
    name: string;
    line?: string;
    color?: string;
  }> = [];

  let isFirstBoarding = true;
  const processedStopNames = new Set<string>();

  // First pass: collect all special stops (board, transfer, arrive) with their names
  const specialStops = new Map<string, "board" | "arrive" | "transfer">();

  routeData.steps.forEach((step) => {
    if (step.action === "board" && step.at && isFirstBoarding) {
      specialStops.set(step.at, "board");
      isFirstBoarding = false;
    }
    if (step.action === "transfer" && step.at) {
      specialStops.set(step.at, "transfer");
    }
    if (step.action === "arrive" && step.at) {
      specialStops.set(step.at, "arrive");
    }
  });

  // Second pass: process all stops with correct actions
  isFirstBoarding = true;
  routeData.steps.forEach((step, stepIndex) => {
    // Walk step - add start point if it's the first step
    if (
      (step.action === "walk" || step.type === "walk") &&
      step.polyline &&
      step.polyline.length > 0
    ) {
      // Only add walk start marker if it's the first step (from current location)
      if (stepIndex === 0 && step.from) {
        stops.push({
          location: step.polyline[0],
          action: "walk",
          name: step.from,
        });
        processedStopNames.add(step.from);
      }
    }

    // Start stop - board action
    if (step.action === "board" && isFirstBoarding && step.at) {
      let location = null;

      // Look for the next travel step to get polyline start point
      for (let i = stepIndex + 1; i < routeData.steps.length; i++) {
        const nextStep = routeData.steps[i];
        if (
          nextStep.action === "travel" &&
          nextStep.polyline &&
          nextStep.polyline.length > 0
        ) {
          location = nextStep.polyline[0];
          break;
        }
      }

      if (location) {
        stops.push({
          location: location,
          action: "board",
          name: step.at,
          line: step.line,
        });
        processedStopNames.add(step.at);
        isFirstBoarding = false;
      }
    }

    // Transfer stops
    if (step.action === "transfer" && step.location && step.at) {
      if (!processedStopNames.has(step.at)) {
        stops.push({
          location: step.location,
          action: "transfer",
          name: step.at,
        });
        processedStopNames.add(step.at);
      }
    }

    // Regular stops from travel steps (stops_between)
    if (step.action === "travel" && step.stops_between && step.polyline) {
      const stopsCount = step.stops_between.length;
      const polylineLength = step.polyline.length;

      step.stops_between.forEach((stopName, idx) => {
        // Skip if already processed or is a special stop
        if (processedStopNames.has(stopName) || specialStops.has(stopName)) {
          return;
        }

        // Estimate stop location along the polyline
        const progress = (idx + 1) / (stopsCount + 1);
        const polylineIndex = Math.floor(progress * (polylineLength - 1));
        const stopLocation = step.polyline![polylineIndex];

        if (stopLocation) {
          stops.push({
            location: stopLocation,
            action: "travel",
            name: stopName,
            line: step.line,
            color: step.color,
          });
          processedStopNames.add(stopName);
        }
      });
    }

    // End stop
    if (step.action === "arrive" && step.location && step.at) {
      if (!processedStopNames.has(step.at)) {
        stops.push({
          location: step.location,
          action: "arrive",
          name: step.at,
        });
        processedStopNames.add(step.at);
      }
    }
  });

  return stops;
};

// Loading Screen Component - Simple white background with cyan spinner
function LoadingScreen() {
  return (
    <div className="map-loading-overlay-simple">
      <div className="loading-spinner-cyan"></div>
    </div>
  );
}

// Zoom Control Component
function ZoomControl() {
  const map = useMap();
  const { t } = useTranslation();

  return (
    <div className="zoom-controls">
      <button
        className="zoom-button"
        onClick={() => map.zoomIn()}
        aria-label={t("controls.zoom_in")}
      >
        +
      </button>
      <div className="zoom-divider" />
      <button
        className="zoom-button"
        onClick={() => map.zoomOut()}
        aria-label={t("controls.zoom_out")}
      >
        −
      </button>
    </div>
  );
}

// Component to fit map bounds when route is displayed
function FitRouteBounds({ routeData }: { routeData: RouteData | null }) {
  const map = useMap();

  useEffect(() => {
    if (!routeData) return;

    const allCoordinates: LatLngExpression[] = [];
    routeData.steps.forEach((step) => {
      if (step.polyline && step.polyline.length > 0) {
        allCoordinates.push(...step.polyline);
      }
      if (step.location) {
        allCoordinates.push(step.location);
      }
    });

    if (allCoordinates.length > 0) {
      setTimeout(() => {
        map.fitBounds(allCoordinates as any, {
          padding: [50, 50],
          maxZoom: 16,
        });
      }, 300);
    }
  }, [routeData, map]);

  return null;
}

// Route visualization component - renders directly on main map
function RouteVisualization({ routeData }: { routeData: RouteData }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";

  // Get all stops using the same logic as RouteMapModal
  const allStops = getAllStopsFromRoute(routeData);

  // Get line labels for ALL travel segments (not just boarding points)
  const getLineLabels = () => {
    const labels: Array<{
      location: LatLngExpression;
      line: string;
      color: string;
    }> = [];

    routeData.steps.forEach((step) => {
      // Add label for all travel steps (each bus segment gets a label)
      if (
        step.action === "travel" &&
        step.line &&
        step.polyline &&
        step.polyline.length > 0
      ) {
        // Place label at approximately 15% along the polyline for better visibility
        const labelIndex = Math.floor(step.polyline.length * 0.15);
        labels.push({
          location: step.polyline[labelIndex] || step.polyline[0],
          line: step.line,
          color: step.color || "#FBBC04",
        });
      }
    });

    return labels;
  };

  const lineLabels = getLineLabels();

  // Get action label for popup
  const getActionLabel = (action: string) => {
    switch (action) {
      case "walk":
        return t("route.walk");
      case "board":
        return t("route.board");
      case "arrive":
        return t("route.arrive");
      case "transfer":
        return t("route.transfer");
      default:
        return t("bus_stop.title");
    }
  };

  // Get background color for popup badge
  const getActionBgColor = (action: string) => {
    switch (action) {
      case "walk":
        return "#f3f4f6";
      case "board":
        return "#d1fae5";
      case "arrive":
        return "#fee2e2";
      case "transfer":
        return "#fef3c7";
      default:
        return "#f0f9ff";
    }
  };

  // Get text color for popup badge
  const getActionTextColor = (action: string) => {
    switch (action) {
      case "walk":
        return "#374151";
      case "board":
        return "#065f46";
      case "arrive":
        return "#991b1b";
      case "transfer":
        return "#92400e";
      default:
        return "#0c4a6e";
    }
  };

  // Check if step is a walk step
  const isWalkStep = (step: RouteStep) => {
    return step.action === "walk" || step.type === "walk";
  };

  // Helper to darken a color for the border
  const darkenColor = (color: string, amount: number = 0.3): string => {
    // Handle hex colors
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
      const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
      const b = Math.max(0, (num & 0xff) * (1 - amount));
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
    return color;
  };

  return (
    <>
      {/* Render polylines for all steps - Google Maps style with border */}
      {routeData.steps.map((step, index) => {
        if (step.polyline && step.polyline.length > 0) {
          const isWalk = isWalkStep(step);
          const mainColor = isWalk ? "#6B7280" : step.color || "#4285F4";
          const borderColor = isWalk
            ? "#4B5563"
            : darkenColor(step.color || "#4285F4", 0.4);

          return (
            <React.Fragment key={`route-polyline-${index}`}>
              {/* Border/outline polyline (darker, thicker) */}
              <Polyline
                positions={step.polyline}
                pathOptions={{
                  color: borderColor,
                  weight: isWalk ? 6 : 10,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round",
                  dashArray: isWalk ? "1, 12" : undefined,
                }}
              />
              {/* Main route polyline (lighter, thinner) */}
              <Polyline
                positions={step.polyline}
                pathOptions={{
                  color: mainColor,
                  weight: isWalk ? 4 : 6,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round",
                  dashArray: isWalk ? "1, 12" : undefined,
                }}
              />
            </React.Fragment>
          );
        }
        return null;
      })}

      {/* Render line labels for ALL travel segments */}
      {lineLabels.map((label, index) => (
        <Marker
          key={`line-label-${index}`}
          position={label.location}
          icon={createLineLabelIcon(label.line, label.color)}
          zIndexOffset={1000}
        />
      ))}

      {/* Render all stop markers with popups - styled like BusStopModal */}
      {allStops.map((stop, index) => (
        <Marker
          key={`route-stop-${index}-${stop.name}`}
          position={stop.location}
          icon={createStopIcon(stop.action, stop.name, stop.color)}
          title={stop.name}
        >
          <Popup>
            <div
              style={{
                padding: "0",
                minWidth: "200px",
                direction: isRTL ? "rtl" : "ltr",
              }}
            >
              {/* Popup Header - styled like BusStopModal */}
              <div
                style={{
                  background:
                    "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
                  padding: "12px 14px",
                  borderRadius: "0",
                  marginBottom: "0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      background: "white",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 20 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M20 3V12C20 12.71 19.62 13.36 19 13.72V15.25C19 15.66 18.66 16 18.25 16H17.75C17.34 16 17 15.66 17 15.25V14H10V15.25C10 15.66 9.66 16 9.25 16H8.75C8.34 16 8 15.66 8 15.25V13.72C7.39 13.36 7 12.71 7 12V3C7 0 10 0 13.5 0C17 0 20 0 20 3Z"
                        fill="#0c4a6e"
                      />
                    </svg>
                  </div>
                  <div
                    style={{
                      color: "white",
                      fontWeight: "700",
                      fontSize: "14px",
                      lineHeight: "1.3",
                      flex: 1,
                    }}
                  >
                    {stop.name}
                  </div>
                </div>
              </div>

              {/* Popup Body */}
              <div
                style={{
                  padding: "12px 14px",
                  background: "white",
                }}
              >
                {/* Line info if available */}
                {stop.line && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "10px",
                      padding: "8px 10px",
                      background: "#f0f9ff",
                      borderRadius: "8px",
                      border: "1px solid #e0f2fe",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M7 18V7.414a1 1 0 01.293-.707l2.414-2.414A1 1 0 0110.414 4H17a1 1 0 011 1v13M7 14h10"
                        stroke="#0891b2"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#0891b2",
                        fontWeight: "600",
                      }}
                    >
                      {t("filters.lines")}: {stop.line}
                    </span>
                  </div>
                )}

                {/* Action type badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px 12px",
                    backgroundColor: getActionBgColor(stop.action),
                    borderRadius: "8px",
                    border: `1px solid ${getActionBgColor(stop.action)}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: getActionTextColor(stop.action),
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {getActionLabel(stop.action)}
                  </span>
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

function App() {
  const { t, i18n } = useTranslation();
  const {
    data: defaultLocation,
    isLoading,
    // refetch,
    isRefetching,
  } = useDefaultLocation();

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [displayLocation, setDisplayLocation] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [appReady, setAppReady] = useState(false);
  const map = useRef<any>(null);
  const leafletProvider = useGlobalStore((state) => state.leafletProvider);

  // Check if running in React Native WebView
  const isInWebView = !!window.ReactNativeWebView;

  // Send ready signal to React Native when app is loaded
  useEffect(() => {
    if (!isLoading && !isRefetching && defaultLocation && !appReady) {
      setAppReady(true);
      // Small delay to ensure map is rendered
      setTimeout(() => {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: "WEB_APP_READY" })
          );
        }
      }, 500);
    }
  }, [isLoading, isRefetching, defaultLocation, appReady]);

  // Handle messages from React Native
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      const data = event.data;

      // Handle location updates
      if (data.type === "LOCATION_UPDATE" && "latitude" in data) {
        setLocation([data.latitude, data.longitude]);
      }

      // Handle language changes
      if (data.type === "LANGUAGE_CHANGE" && data.language) {
        i18n.changeLanguage(data.language);
      }

      // Handle route data from React Native
      if (data.type === "ROUTE_DATA" && data.routeData) {
        setRouteData(data.routeData);
      }

      // Handle clear route
      if (data.type === "CLEAR_ROUTE") {
        setRouteData(null);
      }

      // Legacy support
      if (!data.type && "latitude" in data) {
        setLocation([data.latitude, data.longitude]);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [i18n]);

  // Update document direction when language changes
  useEffect(() => {
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  function getLocation() {
    setDisplayLocation((prev) => !prev);
    if (!displayLocation && location) {
      map?.current?.flyTo(location, 15);
    } else {
      map?.current?.flyTo(
        [defaultLocation?.latitude, defaultLocation?.longitude],
        15
      );
    }
  }

  // Show loading only when NOT in WebView (React Native handles loading)
  if (((isLoading || isRefetching) && !isInWebView) || !defaultLocation)
    return <LoadingScreen />;

  // if (!defaultLocation)
  //   return (
  //     <div className="center min-h-screen">
  //       <div className="vstack align-items-center">
  //         <h1>{t("search.no_route_found")}</h1>
  //         <button onClick={() => refetch()}>{t("search.searching")}</button>
  //       </div>
  //     </div>
  //   );

  return (
    <MapContainer
      ref={map}
      id="map"
      center={[defaultLocation.latitude, defaultLocation.longitude]}
      zoom={15}
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer url={leafletProvider.url} />
      <DevicePositionMarkers />
      {/* Regular map layers - show when NO route */}
      {!routeData && (
        <>
          {!isLineDisabled && <LineMarkers />}
          <BusStopsMarkers />
        </>
      )}

      {/* Route visualization - show when route exists */}
      {routeData && (
        <>
          <RouteVisualization routeData={routeData} />
          <FitRouteBounds routeData={routeData} />
        </>
      )}

      <ZoomControl />

      {/* Map Controls - position lower when in WebView to avoid search bar */}
      <div
        className={clsx("map-controls", {
          "map-controls-webview": isInWebView,
        })}
      >
        <button
          className="control-button"
          onClick={() => setIsFiltersOpen(true)}
          aria-label={t("controls.filters")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 -960 960 960"
            width="24px"
            height="24px"
            fill="#0c4a6e"
          >
            <path d="M400-240v-80h160v80H400ZM240-440v-80h480v80H240ZM120-640v-80h720v80H120Z" />
          </svg>
        </button>

        {!!window.env && (
          <button
            className={clsx("control-button", { active: displayLocation })}
            onClick={getLocation}
            aria-label={t("controls.my_location")}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="12"
                cy="12"
                r="8"
                stroke="#0c4a6e"
                strokeWidth="2"
                fill="none"
              />
              <circle cx="12" cy="12" r="3" fill="#0c4a6e" />
            </svg>
          </button>
        )}
      </div>

      {displayLocation && location && (
        <Marker position={location} title="Me" icon={userIcon()} />
      )}

      <Modal
        isOpen={isFiltersOpen}
        onRequestClose={() => setIsFiltersOpen(false)}
        className="ReactModal__Content"
        overlayClassName="ReactModal__Overlay"
        closeTimeoutMS={300}
      >
        <Filters onApply={() => setIsFiltersOpen(false)} />
      </Modal>
    </MapContainer>
  );
}

export default App;
