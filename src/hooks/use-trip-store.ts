import { create } from "zustand";
import { RouteData } from "../types.ts";
import {
  locateRider,
  PlanError,
  planTrip,
  rememberPlace,
  TripFrom,
} from "../services/plan-trip.ts";
import { useLocationStore } from "./use-location-store.ts";

/**
 * The trip on the map, whoever asked for it.
 *
 * It used to arrive only from the host, as `ROUTE_DATA`, so a rider could not
 * start one from the map at all. Now the map can plan one itself — from the
 * "Where to?" bar, a stop, or a long-press — and the host is told, so its own
 * search can follow along.
 */

export type TripProblem = "no_location" | "no_route" | "failed";

type State = {
  route: RouteData | null;
  /** Who set the trip. A host trip is the host's to clear as well. */
  source: "host" | "rider" | null;
  planning: string | null;
  problem: TripProblem | null;
};

type Actions = {
  setFromHost: (route: RouteData | null) => void;
  plan: (to: string, from?: { stop: string }) => Promise<void>;
  clear: () => void;
  dismissProblem: () => void;
};

function tellHost(message: Record<string, unknown>) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(message));
  } catch {
    /* No host. */
  }
}

export const useTripStore = create<State & Actions>((set, get) => ({
  route: null,
  source: null,
  planning: null,
  problem: null,

  setFromHost: (route) =>
    set({ route, source: route ? "host" : null, planning: null, problem: null }),

  plan: async (to, from) => {
    set({ planning: to, problem: null });

    let origin: TripFrom;

    if (from) {
      origin = from;
    } else {
      const here = await locateRider(
        () => useLocationStore.getState().here,
        useLocationStore.getState().setHere
      );

      if (!here) {
        set({ planning: null, problem: "no_location" });

        return;
      }

      origin = { here };
    }

    try {
      const route = await planTrip(origin, to);

      // A newer request, or a cancel, while this one was out.
      if (get().planning !== to) return;

      rememberPlace(to);
      set({ route, source: "rider", planning: null, problem: null });
      tellHost({ type: "ROUTE_PLANNED", destination: to, routeData: route });
    } catch (error) {
      if (get().planning !== to) return;

      set({
        planning: null,
        problem: error instanceof PlanError ? error.reason : "failed",
      });
    }
  },

  clear: () => {
    set({ route: null, source: null, planning: null, problem: null });
    tellHost({ type: "ROUTE_CLEARED" });
  },

  dismissProblem: () => set({ problem: null }),
}));
