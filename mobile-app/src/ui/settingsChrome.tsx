import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type HeaderProps = {
  title: string;
  backLabel?: string;
  onBack?: () => void;
  onDone?: () => void;
};

export function SettingsHeader({ title, backLabel = 'Settings', onBack, onDone }: HeaderProps) {
  return (
    <View style={settingsStyles.header}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8}>
          <Text style={settingsStyles.navLink}>‹ {backLabel}</Text>
        </Pressable>
      ) : (
        <Text style={settingsStyles.title}>{title}</Text>
      )}
      {onBack ? <Text style={settingsStyles.nestedTitle} numberOfLines={1}>{title}</Text> : null}
      {onDone ? (
        <Pressable onPress={onDone} accessibilityRole="button">
          <Text style={settingsStyles.done}>Done</Text>
        </Pressable>
      ) : (
        <View style={settingsStyles.doneSpacer} />
      )}
    </View>
  );
}

export function SettingsSection({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[settingsStyles.section, style]}>
      {title ? <Text style={settingsStyles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function SettingsRow({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={settingsStyles.rowLabel}>{label}</Text>
      {value ? <Text style={settingsStyles.rowValue}>{value}</Text> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        style={[settingsStyles.row, selected && settingsStyles.rowSelected]}
        onPress={onPress}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[settingsStyles.row, selected && settingsStyles.rowSelected]}>{content}</View>;
}

export function SettingsNavRow({
  label,
  value,
  subtitle,
  onPress,
}: {
  label: string;
  value?: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={settingsStyles.row} onPress={onPress} accessibilityRole="button">
      <View style={settingsStyles.rowText}>
        <Text style={settingsStyles.navLabel}>{label}</Text>
        {subtitle ? <Text style={settingsStyles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={settingsStyles.rowValue}>{value}</Text> : null}
      <Text style={settingsStyles.chevron}>›</Text>
    </Pressable>
  );
}

export function SettingsActionRow({
  label,
  onPress,
  destructive,
  disabled,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={settingsStyles.row}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text
        style={[
          settingsStyles.actionLabel,
          destructive && settingsStyles.destructiveLabel,
          disabled && settingsStyles.disabledLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SettingsFootnote({ children }: { children: ReactNode }) {
  return <Text style={settingsStyles.footnote}>{children}</Text>;
}

export const settingsStyles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111',
    flex: 1,
  },
  nestedTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    marginBottom: 4,
  },
  navLink: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '400',
    marginBottom: 4,
    minWidth: 72,
  },
  done: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
    minWidth: 48,
    textAlign: 'right',
  },
  doneSpacer: {
    minWidth: 48,
    marginBottom: 6,
  },
  body: {
    padding: 16,
    gap: 18,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#6D6D72',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowSelected: {
    backgroundColor: '#E8F7FF',
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    color: '#111',
    fontSize: 16,
    flex: 1,
    paddingRight: 12,
  },
  navLabel: {
    color: '#111',
    fontSize: 16,
  },
  rowSubtitle: {
    color: '#6D6D72',
    fontSize: 13,
    paddingTop: 2,
  },
  rowValue: {
    color: '#6D6D72',
    fontSize: 16,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  chevron: {
    color: '#C7C7CC',
    fontSize: 22,
    fontWeight: '500',
    marginLeft: 6,
    marginTop: -1,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sliderHint: {
    color: '#6D6D72',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    width: 32,
  },
  actionLabel: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  destructiveLabel: {
    color: '#FF3B30',
  },
  disabledLabel: {
    color: '#C7C7CC',
  },
  footnote: {
    color: '#6D6D72',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  signOut: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  pairingHero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
    gap: 12,
  },
  pairingTitle: {
    color: '#111',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  pairingBody: {
    color: '#6D6D72',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  pairingTimer: {
    color: '#111',
    fontSize: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingTop: 8,
  },
});
