import { create } from "zustand";

type State = {
  /** Lines used by the journey currently drawn, or null when none is. */
  routeLines: string[] | null;
  /** The vehicle the rider is waiting for, or null. */
  journeyBus: number | null;
};

type Actions = {
  setRouteLines: (lines: string[] | null) => void;
  setJourneyBus: (deviceId: number | null) => void;
};

/**
 * The lines a displayed journey travels on, and the one bus on them that
 * matters.
 *
 * While a route is on the map, a vehicle that is not part of it is noise, and
 * worse than noise when the route is drawn in a line colour as dark as the
 * vehicle markers — it reads as a bus on the journey. The marker layers need
 * to know which lines the journey uses, and only the route owns that.
 *
 * Within those lines one vehicle is the rider's: the one the journey card
 * says to catch. Every other bus on the line looks the same as it, so the
 * map has to be told which.
 */
export const useRouteStore = create<State & Actions>((set) => ({
  routeLines: null,
  journeyBus: null,
  setRouteLines: (routeLines: string[] | null) =>
    set(routeLines ? { routeLines } : { routeLines, journeyBus: null }),
  setJourneyBus: (journeyBus: number | null) => set({ journeyBus }),
}));
