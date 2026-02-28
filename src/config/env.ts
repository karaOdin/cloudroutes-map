import { Storage } from "../services/client.ts";

declare global {
  interface Window {
    env?: {
      API_URL?: string;
      TRACCAR_URL?: string;
      TRACCAR_WS_URL?: string;
      TRACCAR_TOKEN?: string;
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
} as const;
