// Android vibration feedback. Off by default (Setări → Vibrații).
import { useApp } from '../store/app';

const PATTERNS = {
  tap: [8],
  ride: [18],
  success: [30, 60, 30],
  bonus: [40, 70, 40, 70, 90],
  goal: [120],
  warn: [60, 40, 60],
} as const;

export type HapticKind = keyof typeof PATTERNS;

export function haptic(kind: HapticKind) {
  if (!useApp.getState().settings.haptics) return;
  try {
    navigator.vibrate?.(PATTERNS[kind] as unknown as number[]);
  } catch {
    /* not supported */
  }
}
