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
import { PlanIssue } from "../services/plan-check.ts";

/**
 * The trip on the map, whoever asked for it.
 *
 * It used to arrive only from the host, as `ROUTE_DATA`, so a rider could not
 * start one from the map at all. Now the map can plan one itself — from the
 * "Where to?" bar, a stop, or a long-press — and the host is told, so its own
 * search can follow along.
 */

export type TripProblem =
  | "no_location"
  | "no_route"
  | "failed"
  /** The planner answered, but with a trip the line data shows to be wrong. */
  | "bad_stop"
  | "bad_transfer"
  | "bad_line";

type State = {
  route: RouteData | null;
  /** Who set the trip. A host trip is the host's to clear as well. */
  source: "host" | "rider" | null;
  planning: string | null;
  problem: TripProblem | null;
  /** Names and distances for the problem's message. */
  problemDetail: Record<string, string | number> | null;
};

type Actions = {
  setFromHost: (route: RouteData | null) => void;
  plan: (to: string, from?: { stop: string }) => Promise<void>;
  clear: () => void;
  dismissProblem: () => void;
  /** Take a trip off the map because its data is wrong, and say why. */
  reject: (issue: PlanIssue) => void;
};

function describeIssue(issue: PlanIssue): {
  problem: TripProblem;
  detail: Record<string, string | number> | null;
} {
  switch (issue.kind) {
    case "stop_off_line":
      return {
        problem: "bad_stop",
        detail: { line: issue.line, stop: issue.stop, metres: Math.round(issue.metres) },
      };
    case "transfer_gap":
      return {
        problem: "bad_transfer",
        detail: { from: issue.from, to: issue.to, metres: Math.round(issue.metres) },
      };
    case "unknown_line":
      return { problem: "bad_line", detail: { line: issue.line } };
    default:
      return { problem: "no_route", detail: null };
  }
}

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
  problemDetail: null,

  setFromHost: (route) =>
    set({
      route,
      source: route ? "host" : null,
      planning: null,
      problem: null,
      problemDetail: null,
    }),

  plan: async (to, from) => {
    set({ planning: to, problem: null, problemDetail: null });

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
      set({ route, source: "rider", planning: null, problem: null, problemDetail: null });
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
    set({ route: null, source: null, planning: null, problem: null, problemDetail: null });
    tellHost({ type: "ROUTE_CLEARED" });
  },

  dismissProblem: () => set({ problem: null, problemDetail: null }),

  reject: (issue) => {
    const { problem, detail } = describeIssue(issue);

    set({ route: null, source: null, planning: null, problem, problemDetail: detail });
    // The host may be showing the same trip in its own list; it should know.
    tellHost({ type: "ROUTE_REJECTED", reason: issue.kind, issue });
  },
}));
