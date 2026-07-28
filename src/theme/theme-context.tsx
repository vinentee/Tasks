import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { getThemeColors, isThemeKey, type AppColors, type ThemeKey } from './tokens';

const THEME_STORAGE_KEY = 'my-tasks-theme-key';

type ThemeContextValue = {
  colors: AppColors;
  isThemeReady: boolean;
  setThemeKey: (themeKey: ThemeKey) => Promise<void>;
  themeKey: ThemeKey;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const colorScheme = useColorScheme();
  const [themeKey, setThemeKeyState] = useState<ThemeKey>('blue');
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((storedThemeKey) => {
        if (mounted && isThemeKey(storedThemeKey)) {
          setThemeKeyState(storedThemeKey);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsThemeReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setThemeKey = useCallback(async (nextThemeKey: ThemeKey) => {
    setThemeKeyState(nextThemeKey);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, nextThemeKey);
  }, []);

  const colors = useMemo(() => getThemeColors(colorScheme, themeKey), [colorScheme, themeKey]);
  const value = useMemo(
    () => ({ colors, isThemeReady, setThemeKey, themeKey }),
    [colors, isThemeReady, setThemeKey, themeKey],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return value;
}
