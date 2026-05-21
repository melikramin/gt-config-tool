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

  setTags: (tags: TagEntry[] | ((prev: TagEntry[]) => TagEntry[])) => void;
  setTotalSlots: (totalSlots: number) => void;
  setUsedSlots: (usedSlots: number) => void;
  setLoaded: (loaded: boolean) => void;
  reset: () => void;
}

const initialState = {
  tags: [] as TagEntry[],
  totalSlots: 0,
  usedSlots: 0,
  loaded: false,
};

export const useTagsStore = create<TagsState>((set) => ({
  ...initialState,

  setTags: (tags) =>
    set((s) => ({ tags: typeof tags === 'function' ? tags(s.tags) : tags })),
  setTotalSlots: (totalSlots) => set({ totalSlots }),
  setUsedSlots: (usedSlots) => set({ usedSlots }),
  setLoaded: (loaded) => set({ loaded }),
  reset: () => set(initialState),
}));
