import { create } from "zustand";

type State = {
  /** True while the rider is travelling the journey turn by turn. */
  active: boolean;
  /** Which ride of the journey the rider is on, or heading for. */
  leg: number;
  /** Whether they are aboard that ride's bus yet. */
  onBoard: boolean;
  /**
   * Furthest the rider has got along the current line's route, in metres.
   * Progress only moves forward: a line that loops back on itself passes
   * near the same street twice, and a single fix projected onto the wrong
   * pass must not send the rider back to the start.
   */
  along: number | null;
  /** When Go was pressed, for the summary at the end. */
  startedAt: number | null;
  /** Set once the last stop is reached. */
  arrivedAt: number | null;
  /** The camera keeps the rider in view until they move the map themselves. */
  tracking: boolean;
};

type Actions = {
  start: () => void;
  stop: () => void;
  board: (along: number) => void;
  advance: (along: number) => void;
  nextLeg: () => void;
  arrive: () => void;
  setTracking: (tracking: boolean) => void;
};

const idle: State = {
  active: false,
  leg: 0,
  onBoard: false,
  along: null,
  startedAt: null,
  arrivedAt: null,
  tracking: true,
};

/**
 * Turn-by-turn state for a journey in progress.
 *
 * What a rider is doing cannot be read off one position — at the stop, a
 * rider waiting and a rider just aboard a bus that has not moved yet are in
 * the same place — so where they are in the journey is remembered and only
 * moved on by evidence: away from the stop along the line with a bus beside
 * them, or at the stop they were to get off at.
 *
 * Not persisted. A reload mid-journey starts from the card again, which is
 * one tap, rather than resuming a state that may no longer be true.
 */
export const useGoStore = create<State & Actions>((set) => ({
  ...idle,
  start: () => set({ ...idle, active: true, startedAt: Date.now() }),
  stop: () => set(idle),
  board: (along) => set({ onBoard: true, along }),
  advance: (along) =>
    set((state) => ({
      along: state.along == null ? along : Math.max(state.along, along),
    })),
  nextLeg: () =>
    set((state) => ({ leg: state.leg + 1, onBoard: false, along: null })),
  arrive: () => set({ arrivedAt: Date.now(), onBoard: false }),
  setTracking: (tracking) => set({ tracking }),
}));
