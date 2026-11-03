import { create } from "zustand";

type State = {
  /** Where the rider is, as the host last reported it, or null. */
  here: [number, number] | null;
};

type Actions = {
  setHere: (here: [number, number]) => void;
};

/**
 * The rider's own position.
 *
 * The host owns this — it arrives over the bridge as `LOCATION_UPDATE` — and
 * App held it in local state, which was enough while only the map marker
 * needed it. Anything else that wants to answer "near me" needs it too, so it
 * lives where both can read it.
 */
export const useLocationStore = create<State & Actions>((set) => ({
  here: null,
  setHere: (here) => set({ here }),
}));
