import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TalkTarget } from '../protocol';
import { session, useSessionStore } from '../session/store';
import { slideToLockHint } from '../talk/slideToLock';
import { ConferenceMembersModal } from './ConferenceMembersModal';
import { GearIcon, LockIcon, MicIcon, ReplyArrowIcon } from './icons';
import { HoldToTalk } from './HoldToTalk';
import { targetLayerCount, visibleTargets } from './layers';
import { SettingsScreen } from './SettingsScreen';
import { TargetRow } from './TargetRow';
import { colors } from './theme';

export function OperatorScreen() {
  const store = useSessionStore();
  const { width, height } = useWindowDimensions();
  const [layerIndex, setLayerIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conferenceTarget, setConferenceTarget] = useState<TalkTarget | null>(null);
  const reply = store.replyTarget;
  const selected = store.selectedTalkTarget;
  const landscape = width > height;
  const layers = targetLayerCount(store.targets.length, width, height);
  const page = visibleTargets(store.targets, layerIndex, width, height);

  useEffect(() => {
    setLayerIndex(0);
  }, [store.productionId, store.targets.length, landscape]);

  const replyLabel = reply ? `Reply to ${reply.label}` : 'Reply';
  const selectLabel = selected ? `Talk to ${selected.label}` : 'Talk';
  const mainTalking = store.talkSelectMode
    ? Boolean(store.talking && selected)
    : Boolean(store.talking && reply);

  const replyButton = store.talkSelectMode ? (
    <HoldToTalk
      accessibilityLabel="Talk to selected destination"
      disabled={!selected}
      locked={Boolean(store.talkLocked && selected)}
      leftHanded={store.leftHanded}
      onPress={() => void session.pressSelectedTalk()}
      onLock={() => void session.lockSelectedTalk()}
      onRelease={() => void session.releaseTalk()}
      style={[
        styles.reply,
        styles.talkSelect,
        landscape && styles.replyLandscape,
        mainTalking && styles.talkSelectActive,
        !selected && styles.replyDisabled,
      ]}
    >
      {store.talkLocked && selected ? (
        <LockIcon color={colors.text} />
      ) : (
        <MicIcon color={selected ? colors.text : 'rgba(255,255,255,0.38)'} />
      )}
      <Text style={[styles.replyText, landscape && styles.replyTextLandscape, !selected && styles.replyMuted]}>
        {selectLabel}
      </Text>
      {selected ? (
        <Text style={styles.replyHint}>{slideToLockHint(store.leftHanded)}</Text>
      ) : null}
    </HoldToTalk>
  ) : (
    <HoldToTalk
      accessibilityLabel="Reply"
      disabled={!reply}
      locked={Boolean(store.talkLocked && reply)}
      leftHanded={store.leftHanded}
      onPress={() => void session.pressReply()}
      onLock={() => void session.lockReply()}
      onRelease={() => void session.releaseTalk()}
      style={[
        styles.reply,
        landscape && styles.replyLandscape,
        mainTalking && styles.replyActive,
        !reply && styles.replyDisabled,
      ]}
    >
      {store.talkLocked && reply ? (
        <LockIcon color={colors.text} />
      ) : (
        <ReplyArrowIcon color={reply ? colors.text : 'rgba(255,255,255,0.38)'} />
      )}
      <Text style={[styles.replyText, landscape && styles.replyTextLandscape, !reply && styles.replyMuted]}>
        {replyLabel}
      </Text>
      {reply ? (
        <Text style={styles.replyHint}>{slideToLockHint(store.leftHanded)}</Text>
      ) : null}
    </HoldToTalk>
  );

  return (
    <View style={[styles.screen, landscape && styles.screenLandscape]}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {store.identity?.name ?? 'talktome'}
        </Text>
        <View style={styles.headerActions}>
          {layers > 1 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setLayerIndex((current) => (current + 1) % layers)}
              style={styles.layer}
            >
              <Text style={styles.layerText}>
                Layer {(layerIndex % layers) + 1}/{layers}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Talk and select mode"
            onPress={() => session.setTalkSelectMode(!store.talkSelectMode)}
            style={[styles.layer, store.talkSelectMode && styles.modeOn]}
          >
            <Text style={styles.layerText}>{store.talkSelectMode ? 'Select' : 'Reply'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => setSettingsOpen(true)}
            style={styles.gear}
          >
            <GearIcon />
          </Pressable>
        </View>
      </View>

      {store.overBudget ? (
        <Text style={styles.warn}>Too many incoming streams — some feeds paused.</Text>
      ) : null}
      {store.error ? <Text style={styles.error}>{store.error}</Text> : null}

      <View
        style={[
          styles.body,
          landscape && styles.bodyLandscape,
          landscape && store.leftHanded && styles.bodyLandscapeLeft,
        ]}
      >
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {page.map((target) => (
            <TargetRow
              key={`${target.type}-${target.id}`}
              target={target}
              compact={landscape}
              onOpenConferenceMembers={setConferenceTarget}
            />
          ))}
        </ScrollView>
        {replyButton}
      </View>

      <SettingsScreen visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConferenceMembersModal target={conferenceTarget} onClose={() => setConferenceTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenLandscape: {
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  name: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
    flexGrow: 1,
    flexShrink: 1,
    marginRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  layer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    height: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  layerText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warn: {
    color: colors.danger,
    marginBottom: 8,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  body: {
    flex: 1,
  },
  bodyLandscape: {
    flexDirection: 'row',
    gap: 10,
  },
  bodyLandscapeLeft: {
    flexDirection: 'row-reverse',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 8,
    paddingBottom: 12,
  },
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(61,214,245,0.20)',
    borderRadius: 16,
    minHeight: 64,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(61,214,245,0.42)',
  },
  replyLandscape: {
    width: 132,
    minWidth: 120,
    maxWidth: 168,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    minHeight: 0,
  },
  replyActive: {
    backgroundColor: 'rgba(122,71,199,0.28)',
    borderColor: 'rgba(158,112,230,0.68)',
  },
  talkSelect: {
    backgroundColor: 'rgba(226,59,74,0.88)',
    borderColor: 'rgba(255,180,180,0.55)',
  },
  talkSelectActive: {
    backgroundColor: '#B81F2E',
    borderColor: 'rgba(255,180,180,0.8)',
  },
  modeOn: {
    backgroundColor: 'rgba(226,59,74,0.35)',
  },
  replyDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  replyText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  replyTextLandscape: {
    fontSize: 16,
    textAlign: 'center',
  },
  replyMuted: {
    color: 'rgba(255,255,255,0.5)',
  },
  replyHint: {
    color: colors.muted,
    fontSize: 11,
  },
});
