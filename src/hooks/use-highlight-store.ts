import { create } from "zustand";

type State = {
  /** Stop the map is currently calling out, or null. */
  highlighted: number | null;
};

type Actions = {
  highlight: (stopId: number) => void;
  clearHighlight: () => void;
};

/**
 * Which stop the map should point at.
 *
 * Flying to a stop moves the map but says nothing about which of the dots now
 * on screen was the one asked for. This marks it so the answer is visible.
 * Not persisted: it is a response to a tap, not a setting.
 */
export const useHighlightStore = create<State & Actions>((set) => ({
  highlighted: null,
  highlight: (stopId: number) => set({ highlighted: stopId }),
  clearHighlight: () => set({ highlighted: null }),
}));
