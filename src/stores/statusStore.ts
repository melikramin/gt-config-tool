import { create } from 'zustand';

interface StatusState {
  // Polling data will be populated when Status tab is implemented
  lastError: string;
  isLoading: boolean;
  progress: number; // 0-100, -1 = hidden
  progressText: string;

  setLastError: (error: string) => void;
  setLoading: (loading: boolean) => void;
  setProgress: (progress: number, text?: string) => void;
  clearProgress: () => void;
}

export const useStatusStore = create<StatusState>((set) => ({
  lastError: '',
  isLoading: false,
  progress: -1,
  progressText: '',

  setLastError: (lastError) => set({ lastError }),
  setLoading: (isLoading) => set({ isLoading }),
  setProgress: (progress, progressText = '') => set({ progress, progressText }),
  clearProgress: () => set({ progress: -1, progressText: '' }),
}));
