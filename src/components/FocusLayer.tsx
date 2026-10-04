import { CSSProperties } from "react";
import { useMapEvent } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { useLines } from "@cloudroutes/query/lines";
import { useFocusStore } from "../hooks/use-focus-store.ts";
import { useFollowStore } from "../hooks/use-follow-store.ts";

/**
 * Clears the focused line when the user taps the map background.
 *
 * Lines set `bubblingMouseEvents: false`, so a tap that lands on a line never
 * reaches this handler — only a tap on empty map does. Renders nothing.
 */
export function FocusController() {
  const clearFocus = useFocusStore((state) => state.clearFocus);

  useMapEvent("click", () => clearFocus());

  return null;
}

/**
 * The pill that appears once a line is focused: says which line, and gives an
 * explicit way out. Without it, focus mode is a state the user can enter by
 * accident and not know how to leave.
 */
export function FocusBanner() {
  const { t } = useTranslation();
  const focusedLine = useFocusStore((state) => state.focusedLine);
  const clearFocus = useFocusStore((state) => state.clearFocus);
  const { data: lines } = useLines();

  if (!focusedLine) return null;

  const line = lines?.find((l) => l.name === focusedLine);
  const style = { "--focus-color": line?.color } as CSSProperties;

  return (
    <div className="focus-banner" style={style} role="status">
      <span className="focus-banner__dot" aria-hidden="true" />
      <span className="focus-banner__name">{focusedLine}</span>
      <button
        type="button"
        className="focus-banner__clear"
        onClick={clearFocus}
        aria-label={t("focus.show_all")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

/**
 * Shown while the map is tracking a vehicle, with the way out.
 *
 * Following moves the map on its own, which is alarming if you did not realise
 * you had asked for it — so it has to say so, and offer a single tap to stop.
 */
export function FollowBanner() {
  const { t } = useTranslation();
  const followed = useFollowStore((state) => state.followed);
  const stopFollowing = useFollowStore((state) => state.stopFollowing);

  if (followed === null) return null;

  return (
    <div className="focus-banner follow-banner" role="status">
      <span className="follow-banner__pulse" aria-hidden="true" />
      <span className="focus-banner__name">{t("follow.following")}</span>
      <button
        type="button"
        className="focus-banner__clear"
        onClick={stopFollowing}
        aria-label={t("follow.stop")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
