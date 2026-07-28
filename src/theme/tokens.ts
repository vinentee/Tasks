export const lightColors = {
  background: '#f6f8fb',
  surface: '#ffffff',
  surfaceMuted: '#edf2f7',
  border: '#d8e0ea',
  text: '#152033',
  muted: '#64748b',
  primary: '#2563eb',
  primarySoft: '#dbeafe',
  success: '#15803d',
  successSoft: '#dcfce7',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  shadow: '#0f172a',
};

export const darkColors = {
  background: '#101010',
  surface: '#151515',
  surfaceMuted: '#201f21',
  border: '#262626',
  text: '#f5f5f5',
  muted: '#b7b7c4',
  primary: '#0b64d8',
  primarySoft: '#bfd0ff',
  success: '#0f8f62',
  successSoft: '#0c3c2c',
  warning: '#b91c1c',
  warningSoft: '#3b1515',
  danger: '#b91c1c',
  dangerSoft: '#3b1515',
  shadow: '#000000',
};

export type AppColors = typeof lightColors;
export type ThemeKey = 'blue' | 'lilac' | 'amber' | 'emerald' | 'rose';

type AccentPalette = {
  label: string;
  light: Pick<AppColors, 'primary' | 'primarySoft'>;
  dark: Pick<AppColors, 'primary' | 'primarySoft'>;
};

export const accentPalettes: Record<ThemeKey, AccentPalette> = {
  blue: {
    label: 'Azul',
    light: {
      primary: lightColors.primary,
      primarySoft: lightColors.primarySoft,
    },
    dark: {
      primary: darkColors.primary,
      primarySoft: darkColors.primarySoft,
    },
  },
  lilac: {
    label: 'Lilás',
    light: {
      primary: '#7c3aed',
      primarySoft: '#ede9fe',
    },
    dark: {
      primary: '#a78bfa',
      primarySoft: '#3b2a5e',
    },
  },
  amber: {
    label: 'Amarelo',
    light: {
      primary: '#d97706',
      primarySoft: '#fef3c7',
    },
    dark: {
      primary: '#f59e0b',
      primarySoft: '#4a3308',
    },
  },
  emerald: {
    label: 'Verde',
    light: {
      primary: '#059669',
      primarySoft: '#d1fae5',
    },
    dark: {
      primary: '#34d399',
      primarySoft: '#123f31',
    },
  },
  rose: {
    label: 'Rosa',
    light: {
      primary: '#e11d48',
      primarySoft: '#ffe4e6',
    },
    dark: {
      primary: '#fb7185',
      primarySoft: '#4a1826',
    },
  },
};

export const themeOptions = (Object.keys(accentPalettes) as ThemeKey[]).map((key) => ({
  key,
  label: accentPalettes[key].label,
  swatch: accentPalettes[key].light.primary,
  softSwatch: accentPalettes[key].light.primarySoft,
}));

export const colors = lightColors;

export function isThemeKey(value: string | null | undefined): value is ThemeKey {
  return Boolean(value && value in accentPalettes);
}

export function getThemeColors(colorScheme: 'light' | 'dark' | null | undefined, themeKey: ThemeKey = 'blue'): AppColors {
  const baseColors = colorScheme === 'dark' ? darkColors : lightColors;
  const accent = colorScheme === 'dark'
    ? (accentPalettes[themeKey] ?? accentPalettes.blue).dark
    : (accentPalettes[themeKey] ?? accentPalettes.blue).light;

  return {
    ...baseColors,
    ...accent,
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
};

export const typography = {
  hero: 40,
  title: 28,
  subtitle: 20,
  body: 16,
  small: 13,
};

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
  black: 'PlusJakartaSans_800ExtraBold',
};
