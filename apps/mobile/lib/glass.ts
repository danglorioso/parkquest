import type { ComponentType } from 'react';

// expo-glass-effect's native module is absent in Expo Go (and in dev clients
// built before it was added), and its import throws in that case — guard it
// so every call site can fall back to a flat/blurred surface instead of
// crashing on mount.
export let GlassView: ComponentType<{
  style?: object;
  glassEffectStyle?: string;
  tintColor?: string;
  isInteractive?: boolean;
  children?: React.ReactNode;
}> | null = null;
export let GlassContainer: ComponentType<{
  style?: object;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
  children?: React.ReactNode;
}> | null = null;
export let liquidGlassAvailable = false;
try {
  const glassEffect = require('expo-glass-effect');
  GlassView = glassEffect.GlassView;
  GlassContainer = glassEffect.GlassContainer;
  liquidGlassAvailable = glassEffect.isLiquidGlassAvailable();
} catch {
  // keep fallbacks
}
