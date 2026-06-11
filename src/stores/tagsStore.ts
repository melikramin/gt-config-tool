import { create } from 'zustand';
import type { TagEntry } from '../lib/commands';

// Persists the read/imported keys list across tab switches.
// TagsTab unmounts when the user navigates away (App renders only the active
// tab), so this data must live outside the component. Cleared on disconnect —
// see App.tsx — because the list is device-specific.
interface TagsState {
  tags: TagEntry[];
  totalSlots: number;
  usedSlots: number;
  loaded: boolean;
  // True while a long read/write is running. Lives here (not in the component)
  // so navigation can be blocked even though TagsTab itself stays mounted —
  // see Sidebar, which disables tab switching while this is set.
  busy: boolean;

  setTags: (tags: TagEntry[] | ((prev: TagEntry[]) => TagEntry[])) => void;
  setTotalSlots: (totalSlots: number) => void;
  setUsedSlots: (usedSlots: number) => void;
  setLoaded: (loaded: boolean) => void;
  setBusy: (busy: boolean) => void;
  reset: () => void;
}

const initialState = {
  tags: [] as TagEntry[],
  totalSlots: 0,
  usedSlots: 0,
  loaded: false,
  busy: false,
};

export const useTagsStore = create<TagsState>((set) => ({
  ...initialState,

  setTags: (tags) =>
    set((s) => ({ tags: typeof tags === 'function' ? tags(s.tags) : tags })),
  setTotalSlots: (totalSlots) => set({ totalSlots }),
  setUsedSlots: (usedSlots) => set({ usedSlots }),
  setLoaded: (loaded) => set({ loaded }),
  setBusy: (busy) => set({ busy }),
  reset: () => set(initialState),
}));
