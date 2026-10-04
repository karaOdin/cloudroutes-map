import { create } from "zustand";

type State = {
  /** Traccar device id of the vehicle the map is tracking, or null. */
  followed: number | null;
};

type Actions = {
  toggleFollow: (deviceId: number) => void;
  stopFollowing: () => void;
};

/**
 * Which vehicle the map is keeping in view.
 *
 * Not persisted, like focus: following is a thing you do for a minute, not a
 * setting. Reopening the app should not quietly pin the map to a bus.
 */
export const useFollowStore = create<State & Actions>((set) => ({
  followed: null,
  toggleFollow: (deviceId: number) =>
    set((state) => ({
      followed: state.followed === deviceId ? null : deviceId,
    })),
  stopFollowing: () => set({ followed: null }),
}));
