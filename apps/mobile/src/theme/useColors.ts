import { useColorScheme } from 'react-native';
import { useThemeStore, ThemeMode } from '@/store/theme';
import { palettes, Palette, Scheme } from './colors';

export function resolveScheme(mode: ThemeMode, system: string | null | undefined): Scheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'light' ? 'light' : 'dark';
}

export function useScheme(): Scheme {
  const mode = useThemeStore((s) => s.mode);
  return resolveScheme(mode, useColorScheme());
}

export function useColors(): Palette {
  return palettes[useScheme()];
}
