import { create } from "zustand";

type State = {
  /** Lines used by the journey currently drawn, or null when none is. */
  routeLines: string[] | null;
};

type Actions = {
  setRouteLines: (lines: string[] | null) => void;
};

/**
 * The lines a displayed journey travels on.
 *
 * While a route is on the map, a vehicle that is not part of it is noise, and
 * worse than noise when the route is drawn in a line colour as dark as the
 * vehicle markers — it reads as a bus on the journey. The marker layers need
 * to know which lines the journey uses, and only the route owns that.
 */
export const useRouteStore = create<State & Actions>((set) => ({
  routeLines: null,
  setRouteLines: (routeLines: string[] | null) => set({ routeLines }),
}));
