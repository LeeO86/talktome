import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  DEFAULT_AUDIO_PREFERENCE,
  formatLinearLevelDb,
  nudgeVolume,
  talkTargetIdentity,
  type TalkTarget,
} from '../protocol';
import { session, useSessionStore } from '../session/store';
import { incomingHighlightsTarget } from '../talk/replyTarget';
import { HoldToTalk } from './HoldToTalk';
import {
  CheckIcon,
  ConferenceIcon,
  HeadphonesIcon,
  ListenOnlyIcon,
  LockIcon,
  PersonIcon,
  PlayIcon,
  StopIcon,
  WalkieTalkieIcon,
  WEB_AVATAR,
  targetAvatarBackground,
} from './icons';
import { colors } from './theme';
import { VolumeOverlay } from './VolumeOverlay';
import { VolumeRing } from './VolumeRing';

type Props = {
  target: TalkTarget;
  compact?: boolean;
  volumeReadout?: boolean;
  height?: number;
  edgeTalkAffordance?: boolean;
  onOpenConferenceMembers?: (target: TalkTarget) => void;
};

export function TargetRow({
  target,
  compact = false,
  volumeReadout = false,
  height,
  edgeTalkAffordance = false,
  onOpenConferenceMembers,
}: Props) {
  const key = talkTargetIdentity(target);
  const talking = useSessionStore((state) => state.talkingTargetKeys.includes(key));
  const locked = useSessionStore((state) => state.lockedTargetKeys.includes(key));
  const incoming = useSessionStore((state) =>
    state.incoming.addressedNow.some((entry) => incomingHighlightsTarget(entry, target)),
  );
  const peers = useSessionStore((state) => state.peers);
  const preference = useSessionStore(
    (state) => state.audioPreferences[key] ?? DEFAULT_AUDIO_PREFERENCE,
  );
  const leftHanded = useSessionStore((state) => state.leftHanded);
  const feedStopped = useSessionStore((state) => state.stoppedFeedKeys.includes(key));
  const feedOnline = useSessionStore((state) => state.activeFeedKeys.includes(key));
  const volumeFader = useSessionStore((state) => state.operatorAudio.volumeFader);
  const talkSelectMode = useSessionStore((state) => state.talkSelectMode);
  const selected = useSessionStore(
    (state) =>
      Boolean(state.selectedTalkTarget) &&
      talkTargetIdentity(state.selectedTalkTarget!) === key,
  );
  const canTalk = session.canTalkTo(target);
  // Web `#targets-list .talk-btn` always paints the walkie, including offline
  // users. Feeds and listen-only conferences have no talk button.
  const showTalkIcon = target.canTalk && target.type !== 'feed';
  const userOnline =
    target.type !== 'user' || peers.some((peer) => peer.kind === 'user' && peer.userId === target.id);
  const dimmed = target.type === 'feed' ? !feedOnline : target.type === 'user' && !userOnline;
  const listenOnly = target.type === 'conference' && !target.canTalk;
  const [volumeOpen, setVolumeOpen] = useState(false);
  const tight = compact || (height != null && height < 64);

  const speaking = incoming;
  const streaming = target.type === 'feed' && feedOnline && !feedStopped;

  const meta =
    target.type === 'feed'
      ? !feedOnline
        ? 'Offline'
        : feedStopped
          ? 'Stopped'
          : streaming
            ? 'Streaming'
            : 'Feed'
      : target.type === 'conference'
        ? listenOnly
          ? 'Listen only'
          : speaking
            ? 'Speaking'
            : 'Conference'
        : userOnline
          ? speaking
            ? 'Speaking'
            : 'Online'
          : 'Offline';

  const avatarColor = dimmed ? WEB_AVATAR.offlineGlyph : WEB_AVATAR.glyph;
  const avatar =
    target.type === 'conference' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose who you hear in ${target.label}`}
        onPress={() => onOpenConferenceMembers?.(target)}
        style={[styles.avatar, { backgroundColor: targetAvatarBackground('conference', dimmed) }]}
      >
        <ConferenceIcon />
        {listenOnly ? (
          <View style={styles.listenBadge}>
            <ListenOnlyIcon color={colors.muted} size={10} />
          </View>
        ) : null}
      </Pressable>
    ) : (
      <View style={[styles.avatar, { backgroundColor: targetAvatarBackground(target.type, dimmed) }]}>
        {target.type === 'feed' ? (
          <HeadphonesIcon />
        ) : (
          <PersonIcon color={avatarColor} letter={target.label} />
        )}
      </View>
    );

  const identity = (
    <View style={styles.identity} pointerEvents="none">
      <View style={styles.nameRow}>
        {locked ? <LockIcon color={colors.text} size={14} /> : null}
        <Text style={[styles.label, dimmed && styles.dimText]} numberOfLines={1}>
          {target.label}
        </Text>
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {meta}
      </Text>
    </View>
  );

  const wrapTalk = (children: ReactNode, style: StyleProp<ViewStyle>, accessibilityLabel: string) => {
    if (talkSelectMode && canTalk) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ selected }}
          onPress={() => session.selectTalkTarget(target)}
          style={style}
        >
          {children}
        </Pressable>
      );
    }
    if (canTalk && !talkSelectMode) {
      return (
        <HoldToTalk
          accessibilityLabel={locked ? `Unlock ${target.label}` : accessibilityLabel}
          disabled={!canTalk}
          locked={locked}
          leftHanded={leftHanded}
          onPress={() => void session.pressTalk(target)}
          onLock={() => void session.lockTalk(target)}
          onRelease={() => void session.releaseTalk(target)}
          style={style}
        >
          {children}
        </HoldToTalk>
      );
    }
    return <View style={style}>{children}</View>;
  };

  const talkZone = wrapTalk(
    identity,
    [styles.talkZone, talking ? styles.talkZoneActive : null],
    talkSelectMode ? `Select ${target.label}` : `Talk to ${target.label}`,
  );

  const edgeIconColor = talking
    ? colors.talking
    : selected
      ? '#FFB020'
      : dimmed
        ? 'rgba(255,255,255,0.28)'
        : colors.text;

  const talkControl = showTalkIcon
    ? wrapTalk(
        talkSelectMode ? (
          <CheckIcon color={edgeIconColor} size={tight ? 18 : 20} checked={selected} />
        ) : (
          <WalkieTalkieIcon color={edgeIconColor} size={tight ? 18 : 22} />
        ),
        [
          styles.talkControl,
          edgeTalkAffordance && styles.edgeTalk,
          talking && styles.talkZoneActive,
        ],
        talkSelectMode
          ? `Select ${target.label}`
          : edgeTalkAffordance
            ? `Talk to ${target.label} from the phone edge`
            : `Talk to ${target.label}`,
      )
    : null;

  const rowStyle = [
    styles.row,
    leftHanded && styles.rowLeft,
    tight && styles.rowCompact,
    talking && styles.rowTalking,
    (speaking || streaming) && !talking && styles.rowSpeaking,
    talkSelectMode && selected && styles.rowSelected,
    dimmed && styles.rowOffline,
    height != null ? { height, minHeight: height, flex: 1, paddingVertical: tight ? 4 : 8 } : null,
  ];

  return (
    <View style={rowStyle}>
      {avatar}
      {talkZone}
      <View
        style={[
          styles.meterCluster,
          leftHanded && styles.meterClusterLeft,
          volumeReadout && styles.meterClusterReadout,
        ]}
      >
        {target.type === 'feed' && feedOnline ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={feedStopped ? 'Start feed' : 'Stop feed'}
            onPress={() => session.toggleFeedReception(target)}
            style={styles.feedButton}
          >
            {feedStopped ? <PlayIcon color={colors.text} /> : <StopIcon color={colors.text} />}
          </Pressable>
        ) : volumeReadout ? null : (
          <View style={styles.feedSlot} />
        )}
        <VolumeRing
          level={preference.volume}
          muted={preference.muted}
          dimmed={dimmed}
          compact={tight}
          variant={volumeReadout ? 'readout' : 'ring'}
          accessibilityLabel={
            preference.muted ? `Volume muted, ${target.label}` : `Volume ${formatLinearLevelDb(preference.volume)}`
          }
          onPress={() => setVolumeOpen(true)}
          onDoublePress={() => session.toggleTargetMuted(target)}
        />
      </View>
      {talkControl}
      <VolumeOverlay
        visible={volumeOpen}
        title={target.label}
        level={preference.volume}
        muted={preference.muted}
        fader={volumeFader}
        onNudge={(direction) => {
          const current = useSessionStore.getState().audioPreferences[key] ?? DEFAULT_AUDIO_PREFERENCE;
          session.setTargetVolume(target, nudgeVolume(current.volume, direction));
        }}
        onChange={(volume) => session.setTargetVolume(target, volume)}
        onToggleMute={() => session.toggleTargetMuted(target)}
        onClose={() => setVolumeOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  rowLeft: {
    flexDirection: 'row-reverse',
  },
  rowCompact: {
    minHeight: 62,
    paddingHorizontal: 8,
  },
  rowTalking: {
    backgroundColor: 'rgba(122,71,199,0.20)',
    borderColor: 'rgba(158,112,230,0.55)',
  },
  rowSpeaking: {
    borderColor: 'rgba(117,242,184,0.32)',
  },
  // Amber "armed" highlight: red is reserved for live transmission (Talk button),
  // so the selected destination must not look like it is already on air.
  rowSelected: {
    backgroundColor: 'rgba(255,176,32,0.16)',
    borderColor: 'rgba(255,176,32,0.66)',
  },
  rowOffline: {
    opacity: 0.72,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#121826',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  talkZone: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 0,
  },
  talkZoneActive: {
    opacity: 1,
  },
  identity: {
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    flexShrink: 1,
  },
  dimText: {
    color: 'rgba(255,255,255,0.55)',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  meterCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meterClusterLeft: {
    flexDirection: 'row-reverse',
  },
  meterClusterReadout: {
    gap: 4,
  },
  feedSlot: {
    width: 40,
    height: 40,
  },
  feedButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  talkControl: {
    width: 36,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  edgeTalk: {
    width: 44,
  },
});
