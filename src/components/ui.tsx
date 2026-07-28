import type { PropsWithChildren } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
} from 'react-native';

import { fontFamily, getThemeColors, radius, spacing, typography, type AppColors } from '../theme/tokens';
import { useTheme } from '../theme/theme-context';

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}>;

export function Button({ children, disabled, onPress, variant = 'primary' }: ButtonProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>{children}</Text>
    </Pressable>
  );
}

export function Card({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return <View style={styles.card}>{children}</View>;
}

export function Field({ style, ...props }: TextInputProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return <TextInput placeholderTextColor={colors.muted} style={[styles.field, style]} {...props} />;
}

export function SectionTitle({ children, muted }: PropsWithChildren<{ muted?: string }>) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {muted ? <Text style={styles.muted}>{muted}</Text> : null}
    </View>
  );
}

export function Pill({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'blue' | 'green' | 'amber' }>) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const toneStyle = {
    neutral: styles.neutralPill,
    blue: styles.bluePill,
    green: styles.greenPill,
    amber: styles.amberPill,
  }[tone];

  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

export function useTextStyles() {
  const { colors } = useTheme();

  return StyleSheet.create({
  title: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.title,
    fontWeight: '800',
  } satisfies TextStyle,
  subtitle: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontSize: typography.subtitle,
    fontWeight: '700',
  } satisfies TextStyle,
  body: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
  } satisfies TextStyle,
  muted: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
  } satisfies TextStyle,
  });
}

export const textStyles = StyleSheet.create({
  title: {
    color: getThemeColors('light').text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.title,
    fontWeight: '800',
  } satisfies TextStyle,
  subtitle: {
    color: getThemeColors('light').text,
    fontFamily: fontFamily.bold,
    fontSize: typography.subtitle,
    fontWeight: '700',
  } satisfies TextStyle,
  body: {
    color: getThemeColors('light').text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
  } satisfies TextStyle,
  muted: {
    color: getThemeColors('light').muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
  } satisfies TextStyle,
});

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonText: {
    color: colors.surface,
    fontFamily: fontFamily.bold,
    fontSize: typography.body,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.primarySoft,
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  field: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  muted: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillText: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontSize: typography.small,
    fontWeight: '700',
  },
  neutralPill: {
    backgroundColor: colors.surfaceMuted,
  },
  bluePill: {
    backgroundColor: colors.primarySoft,
  },
  greenPill: {
    backgroundColor: colors.successSoft,
  },
  amberPill: {
    backgroundColor: colors.warningSoft,
  },
  });
}
