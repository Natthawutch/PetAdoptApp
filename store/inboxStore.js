import { create } from "zustand";

export const useInboxStore = create((set) => ({
  inboxCount: 0,
  setInboxCount: (n) => set({ inboxCount: n }),
}));
