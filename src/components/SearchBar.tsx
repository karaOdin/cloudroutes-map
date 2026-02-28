/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import Select from "react-select";
import { useStops } from "@cloudroutes/query/lines";
import { QUERY_KEYS } from "@cloudroutes/query";
import axios from "axios";
import { Env } from "../config/env";
import { useTranslation } from "react-i18next";

type StopOption = {
  value: string;
  label: string;
  lat: number;
  lng: number;
};

type SearchBarProps = {
  onRouteFound: (routeData: any) => void;
  onClearRoute: () => void;
  currentLocation?: [number, number] | null;
};

export function SearchBar({
  onRouteFound,
  onClearRoute,
  currentLocation,
}: SearchBarProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";

  const [isExpanded, setIsExpanded] = useState(false);
  const [startStop, setStartStop] = useState<StopOption | null>(null);
  const [endStop, setEndStop] = useState<StopOption | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [showNearbyStops, setShowNearbyStops] = useState(false);
  const [nearbyStops, setNearbyStops] = useState<any[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);

  const { data: stops } = useStops<StopOption[]>({
    queryKey: [QUERY_KEYS.STOPS],
    select: (data) => {
      return data.map((stop) => {
        return {
          value: stop.name,
          label: stop.name,
          lat: parseFloat(stop.latitude),
          lng: parseFloat(stop.longitude),
        };
      });
    },
  });

  const stopOptions = stops || [];

  const fetchNearbyStops = async () => {
    if (!currentLocation) return;

    setLoadingNearby(true);
    try {
      const response = await axios.post(`${Env.API_URL}/find-nearest-stop`, {
        lat: currentLocation[0],
        lng: currentLocation[1],
        max_distance: 1.5,
        include_polyline: false,
      });

      if (response.data.success && response.data.stops) {
        setNearbyStops(response.data.stops);
        setShowNearbyStops(true);
      }
    } catch (err) {
      console.error("Error fetching nearby stops:", err);
    } finally {
      setLoadingNearby(false);
    }
  };

  const handleSearch = async () => {
    setError(null);

    if (!useCurrentLocation && !startStop) {
      setError(t("search.select_starting_point"));
      return;
    }

    if (!endStop) {
      setError(t("search.select_destination_point"));
      return;
    }

    setIsSearching(true);

    try {
      let routeData;

      if (useCurrentLocation && currentLocation) {
        const response = await axios.post(`${Env.API_URL}/plan-journey`, {
          start_lat: currentLocation[0],
          start_lng: currentLocation[1],
          end_stop: endStop.value,
        });
        routeData = response.data;
      } else if (startStop && endStop) {
        const response = await axios.get(`${Env.API_URL}/find-route`, {
          params: {
            start: startStop.value,
            end: endStop.value,
          },
        });
        routeData = response.data;
      }

      if (routeData && routeData.success) {
        onRouteFound(routeData);
        setIsExpanded(false);
        setShowNearbyStops(false);
      } else {
        setError(routeData?.message || t("search.no_route_found"));
      }
    } catch (err: any) {
      console.error("Search error:", err);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          t("search.failed_to_find_route")
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setStartStop(null);
    setEndStop(null);
    setUseCurrentLocation(false);
    setError(null);
    setShowNearbyStops(false);
    setNearbyStops([]);
    onClearRoute();
  };

  const handleSwapStops = () => {
    const temp = startStop;
    setStartStop(endStop);
    setEndStop(temp);
  };

  const customSelectStyles = {
    control: (provided: any, state: any) => ({
      ...provided,
      borderRadius: "12px",
      borderColor: state.isFocused ? "#0c4a6e" : "#e5e7eb",
      borderWidth: "2px",
      minHeight: "48px",
      boxShadow: state.isFocused ? "0 0 0 3px rgba(67, 56, 202, 0.1)" : "none",
      transition: "all 0.2s",
      fontSize: "14px",
      cursor: "pointer",
      background: "white",
      direction: isRTL ? "rtl" : "ltr",
    }),
    option: (provided: any, state: any) => ({
      ...provided,
      textAlign: isRTL ? "right" : "left",
      direction: isRTL ? "rtl" : "ltr",
      backgroundColor: state.isSelected
        ? "##0c4a6e"
        : state.isFocused
          ? "#eef2ff"
          : "white",
      color: state.isSelected ? "white" : "#1f2937",
      padding: "12px 14px",
      cursor: "pointer",
      fontWeight: state.isSelected ? "600" : "400",
      transition: "all 0.15s",
      fontSize: "14px",
    }),
    singleValue: (provided: any) => ({
      ...provided,
      textAlign: isRTL ? "right" : "left",
      direction: isRTL ? "rtl" : "ltr",
      color: "#1f2937",
      fontWeight: "500",
      fontSize: "14px",
    }),
    placeholder: (provided: any) => ({
      ...provided,
      textAlign: isRTL ? "right" : "left",
      direction: isRTL ? "rtl" : "ltr",
      color: "#9ca3af",
      fontSize: "14px",
    }),
    menu: (provided: any) => ({
      ...provided,
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
      marginTop: "8px",
      border: "2px solid #e5e7eb",
      zIndex: 10000,
    }),
    menuList: (provided: any) => ({
      ...provided,
      padding: "6px",
      maxHeight: "220px",
    }),
  };

  return (
    <div
      className={`search-bar-container ${isExpanded ? "expanded" : ""} ${isRTL ? "rtl" : ""}`}
    >
      {/* Collapsed State */}
      {!isExpanded && (
        <button
          className="search-bar-toggle"
          onClick={() => setIsExpanded(true)}
          aria-label={t("search.search_route")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="##0c4a6e"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
              fill="white"
            />
          </svg>
          <span>{t("search.search_route")}</span>
        </button>
      )}

      {/* Expanded State */}
      {isExpanded && (
        <div className="search-bar-content">
          <div className="search-bar-header">
            <h3 className="search-bar-title">{t("search.title")}</h3>
            <button
              className="search-bar-close"
              onClick={() => {
                setIsExpanded(false);
                setShowNearbyStops(false);
              }}
              aria-label={t("filters.close")}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="#4b5563"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="search-bar-body">
            {/* Current Location Toggle */}
            {currentLocation && (
              <div className="search-location-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={useCurrentLocation}
                    onChange={(e) => {
                      setUseCurrentLocation(e.target.checked);
                      if (e.target.checked) {
                        setStartStop(null);
                        fetchNearbyStops();
                      } else {
                        setShowNearbyStops(false);
                        setNearbyStops([]);
                      }
                    }}
                  />
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="8"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      fill="none"
                    />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                  <span>{t("search.use_current_location")}</span>
                </label>
              </div>
            )}

            {/* Nearby Stops */}
            {showNearbyStops && (
              <div className="nearby-stops-list">
                <div className="nearby-stops-header">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                      fill="#10b981"
                    />
                    <circle cx="12" cy="9" r="2.5" fill="white" />
                  </svg>
                  <span>{t("search.nearby_stops")}</span>
                </div>
                {loadingNearby ? (
                  <div className="nearby-stops-loading">
                    <div className="spinner-primary spinner-small"></div>
                    <span>{t("search.searching")}</span>
                  </div>
                ) : nearbyStops.length > 0 ? (
                  <div className="nearby-stops-items">
                    {nearbyStops.slice(0, 3).map((stop, index) => (
                      <button
                        key={index}
                        className="nearby-stop-item"
                        onClick={() => {
                          setStartStop({
                            value: stop.name,
                            label: stop.name,
                            lat: stop.lat,
                            lng: stop.lng,
                          });
                          setShowNearbyStops(false);
                        }}
                      >
                        <div className="nearby-stop-info">
                          <div className="nearby-stop-name">{stop.name}</div>
                          <div className="nearby-stop-distance">
                            {stop.walk_distance.toFixed(2)} {t("nearby.km")} •{" "}
                            {stop.walk_time} {t("nearby.walk_time")}
                          </div>
                        </div>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M9 18l6-6-6-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="nearby-stops-empty">
                    <span>{t("search.no_stops_found")}</span>
                  </div>
                )}
              </div>
            )}

            {/* From Input */}
            {!useCurrentLocation && (
              <div className="search-input-group">
                <label className="search-label">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="8"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                  <span>{t("search.from")}</span>
                </label>
                <Select
                  options={stopOptions}
                  value={startStop}
                  onChange={(newValue) => setStartStop(newValue)}
                  placeholder={t("search.select_start")}
                  styles={customSelectStyles}
                  isSearchable
                  isClearable
                  noOptionsMessage={() => t("search.no_stops_found")}
                />
              </div>
            )}

            {/* Swap Button */}
            {!useCurrentLocation && startStop && endStop && (
              <div className="search-swap-container">
                <button
                  className="search-swap-btn"
                  onClick={handleSwapStops}
                  aria-label={t("search.swap_locations")}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M16 17L21 12L16 7"
                      stroke="#6b7280"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 7L3 12L8 17"
                      stroke="#6b7280"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* To Input */}
            <div className="search-input-group">
              <label className="search-label">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                    fill="currentColor"
                  />
                </svg>
                <span>{t("search.to")}</span>
              </label>
              <Select
                options={stopOptions}
                value={endStop}
                onChange={(newValue) => setEndStop(newValue)}
                placeholder={t("search.select_destination")}
                styles={customSelectStyles}
                isSearchable
                isClearable
                noOptionsMessage={() => t("search.no_stops_found")}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="search-error">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 8v4M12 16h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="search-actions">
              <button
                onClick={handleSearch}
                disabled={
                  isSearching || (!useCurrentLocation && !startStop) || !endStop
                }
                className="search-btn-primary"
              >
                {isSearching ? (
                  <>
                    <div className="spinner-small"></div>
                    <span>{t("search.searching")}</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="10"
                        r="3"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                    <span>{t("search.find_route")}</span>
                  </>
                )}
              </button>
              <button
                onClick={handleClear}
                disabled={isSearching}
                className="search-btn-secondary"
                aria-label={t("search.clear")}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="#6b7280"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
