import { create } from "zustand";

export const useInboxStore = create((set) => ({
  inboxCount: 0,
  lastInboxAt: null,

  setInboxCount: (count) => set({ inboxCount: count ?? 0 }),

  setInboxMeta: ({ inboxCount, lastInboxAt }) =>
    set({
      inboxCount: inboxCount ?? 0,
      lastInboxAt: lastInboxAt ?? null,
    }),

  resetInbox: () => set({ inboxCount: 0, lastInboxAt: null }),
}));
