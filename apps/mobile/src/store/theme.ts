import { create } from 'zustand';
import * as SecureStorage from '@/utils/secureStorage';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme_mode';

interface ThemeStore {
  mode: ThemeMode;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

// 설정 화면(S11)에서 고른다. 저장된 값이 없으면 시스템 설정을 따른다.
export const useThemeStore = create<ThemeStore>((set) => ({
  mode: 'system',
  hydrate: async () => {
    const saved = await SecureStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') set({ mode: saved });
  },
  setMode: async (mode) => {
    set({ mode });
    await SecureStorage.setItem(STORAGE_KEY, mode);
  },
}));
