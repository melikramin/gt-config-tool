import { create } from 'zustand';

interface StatusState {
  // Polling data will be populated when Status tab is implemented
  lastError: string;
  lastErrorIsSuccess: boolean;
  isLoading: boolean;
  progress: number; // 0-100, -1 = hidden
  progressText: string;
  showPasswordError: boolean;

  setLastError: (error: string, isSuccess?: boolean) => void;
  setLoading: (loading: boolean) => void;
  setProgress: (progress: number, text?: string) => void;
  clearProgress: () => void;
  setShowPasswordError: (show: boolean) => void;
}

export const useStatusStore = create<StatusState>((set) => ({
  lastError: '',
  lastErrorIsSuccess: false,
  isLoading: false,
  progress: -1,
  progressText: '',
  showPasswordError: false,

  setLastError: (lastError, lastErrorIsSuccess = false) => set({ lastError, lastErrorIsSuccess }),
  setLoading: (isLoading) => set({ isLoading }),
  setProgress: (progress, progressText = '') => set({ progress, progressText }),
  clearProgress: () => set({ progress: -1, progressText: '' }),
  setShowPasswordError: (showPasswordError) => set({ showPasswordError }),
}));
