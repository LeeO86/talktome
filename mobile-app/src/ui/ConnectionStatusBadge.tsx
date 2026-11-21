import { StyleSheet, Text, View } from 'react-native';

import type { ConnectionHealth, ConnectionHealthKind } from '../session/connectionHealth';
import { colors } from './theme';

const KIND_COLOR: Record<ConnectionHealthKind, string> = {
  idle: '#64748B',
  connecting: '#F59E0B',
  connected: '#34C759',
  warning: '#F97316',
  failed: '#FF5A5A',
};

type Props = {
  health: ConnectionHealth;
  light?: boolean;
  compact?: boolean;
};

export function ConnectionStatusBadge({ health, light = false, compact = false }: Props) {
  const color = KIND_COLOR[health.kind];
  if (compact) {
    return (
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.dotOnly, health.kind === 'failed' && styles.dotOnlyFailed]}
      >
        <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />
      </View>
    );
  }
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, light && styles.badgeLight, health.kind === 'failed' && styles.badgeFailed]}
    >
      <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />
      <Text style={[styles.label, light && styles.labelLight, { color }]}>{health.shortLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  badgeLight: {
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
    borderColor: 'rgba(60, 60, 67, 0.18)',
  },
  badgeFailed: {
    borderColor: 'rgba(255, 90, 90, 0.4)',
  },
  dotOnly: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dotOnlyFailed: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 90, 90, 0.4)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 0.55,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelLight: {
    color: '#3C3C43',
  },
});
