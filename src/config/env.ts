import { Storage } from "../services/client.ts";

declare global {
  interface Window {
    env?: {
      API_URL?: string;
      TRACCAR_URL?: string;
      TRACCAR_WS_URL?: string;
      TRACCAR_TOKEN?: string;
      TRACCAR_USER?: string;
      TRACCAR_PASSWORD?: string;
      OSRM_URL?: string;
      MAP_INSET_TOP?: number;
      LINE_IS_DISABLED?: boolean;
    };
  }
}

export const Env = {
  API_URL:
    window?.env?.API_URL ??
    Storage.get("API_URL") ??
    import.meta?.env.VITE_API_URL,
  TRACCAR_TOKEN:
    window?.env?.TRACCAR_TOKEN ?? import.meta.env.VITE_TRACCAR_TOKEN,
  TRACCAR_URL: window?.env?.TRACCAR_URL ?? import.meta.env.VITE_TRACCAR_URL,
  TRACCAR_WS_URL:
    window?.env?.TRACCAR_WS_URL ?? import.meta.env.VITE_TRACCAR_WS_URL,
  /**
   * Optional Traccar login, for tenants whose Traccar predates token auth.
   *
   * Traccar 4 answers 400 to the `Authorization: Bearer` header the token
   * path uses, and its only other credential is a session cookie it returns
   * without a `SameSite` attribute — which browsers will not store or send
   * cross-site. Basic auth is a header we control, so it crosses origins where
   * the cookie cannot. Left unset, nothing changes and the token is used.
   */
  TRACCAR_USER: window?.env?.TRACCAR_USER ?? import.meta.env.VITE_TRACCAR_USER,
  TRACCAR_PASSWORD:
    window?.env?.TRACCAR_PASSWORD ?? import.meta.env.VITE_TRACCAR_PASSWORD,
  /**
   * Routing service used to recover a stop order the line geometry cannot
   * give. Defaults to OSRM's public demo server, which carries no SLA — a
   * tenant running its own should point this at it.
   */
  OSRM_URL: window?.env?.OSRM_URL ?? import.meta.env.VITE_OSRM_URL,
  /**
   * Pixels of the map covered by the host's own chrome at the top — its search
   * bar. The host knows this and we do not, so it should say; without it a
   * WebView falls back to an assumption that is right for one layout only.
   */
  MAP_INSET_TOP:
    window?.env?.MAP_INSET_TOP ?? import.meta.env.VITE_MAP_INSET_TOP,
} as const;
