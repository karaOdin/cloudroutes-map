import { create } from "zustand";

type State = {
  /** Name of the line the user is concentrating on, or null for the whole map. */
  focusedLine: string | null;
};

type Actions = {
  toggleFocus: (lineName: string) => void;
  clearFocus: () => void;
};

/**
 * Which line the user is currently looking at.
 *
 * Deliberately not persisted, unlike the filter store: focus is a transient
 * "show me this one" gesture, not a setting. Reopening the app should give
 * you the whole network back.
 */
export const useFocusStore = create<State & Actions>((set) => ({
  focusedLine: null,
  toggleFocus: (lineName: string) =>
    set((state) => ({
      focusedLine: state.focusedLine === lineName ? null : lineName,
    })),
  clearFocus: () => set({ focusedLine: null }),
}));
