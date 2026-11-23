import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  DEFAULT_AUDIO_PREFERENCE,
  formatLinearLevelDb,
  talkTargetIdentity,
  type TalkTarget,
} from '../protocol';
import { session, useSessionStore } from '../session/store';
import { incomingHighlightsTarget } from '../talk/replyTarget';
import { HoldToTalk } from './HoldToTalk';
import {
  ConferenceIcon,
  HeadphonesIcon,
  ListenOnlyIcon,
  LockIcon,
  PttButtonIcon,
  PersonIcon,
  PlayIcon,
  StopIcon,
  WalkieTalkieIcon,
  WEB_AVATAR,
  targetAvatarBackground,
} from './icons';
import { FeedVideoPlayer } from './FeedVideoPlayer';
import { colors } from './theme';
import { useKeyboardActivity } from '../keyboard/activity';
import { conferenceSpeakingLabel, targetActivity } from './targetActivity';
import { VolumeRing } from './VolumeRing';
import { beginVolumeAdjustment, endVolumeAdjustment, moveVolumeAdjustment, useVolumeAdjustment } from './volumeAdjustmentState';

type Props = {
  target: TalkTarget;
  compact?: boolean;
  dense?: boolean;
  largerText?: boolean;
  hardwarePtt?: boolean;
  compactLabel?: boolean;
  volumeReadout?: boolean;
  radioSuppressed?: boolean;
  height?: number;
  edgeTalkAffordance?: boolean;
  videoAvailable?: boolean;
  videoExpanded?: boolean;
  videoHeight?: number;
  videoStreamURL?: string;
  videoError?: string;
  onToggleVideo?: () => void;
  onOpenConferenceMembers?: (target: TalkTarget) => void;
  onOpenVolume: () => void;
};

export function TargetRow({
  target,
  compact = false,
  dense = false,
  largerText = false,
  hardwarePtt = false,
  compactLabel = false,
  volumeReadout = false,
  radioSuppressed = false,
  height,
  edgeTalkAffordance = false,
  onOpenConferenceMembers, onOpenVolume,
  videoAvailable = false, videoExpanded = false, videoHeight = 0,
  videoStreamURL, videoError, onToggleVideo,
}: Props) {
  const key = talkTargetIdentity(target);
  const activeVolumeKey = useVolumeAdjustment(state => state.active?.key);
  const adjustingVolume = activeVolumeKey === key;
  const otherVolumeAdjusting = activeVolumeKey != null && !adjustingVolume;
  const canToggleVideo = target.type === 'feed' && (videoAvailable || videoExpanded);
  const talking = useSessionStore((state) => state.talkingTargetKeys.includes(key));
  const keyboardHeld = useKeyboardActivity(state => state.targetKeys.includes(key));
  const locked = useSessionStore((state) => state.lockedTargetKeys.includes(key));
  const incomingEntries = useSessionStore((state) => state.incoming.addressedNow);
  const incoming = incomingEntries.some((entry) => incomingHighlightsTarget(entry, target));
  const peers = useSessionStore((state) => state.peers);
  const preference = useSessionStore(
    (state) => state.audioPreferences[key] ?? DEFAULT_AUDIO_PREFERENCE,
  );
  const leftHanded = useSessionStore((state) => state.leftHanded);
  const tapToLock = useSessionStore((state) => state.tapToLock);
  const feedStopped = useSessionStore((state) => state.stoppedFeedKeys.includes(key));
  const feedOnline = useSessionStore((state) => state.activeFeedKeys.includes(key));
  const canTalk = session.canTalkTo(target);
  // Web `#targets-list .talk-btn` always paints the walkie, including offline
  // users. Feeds and listen-only conferences have no talk button.
  const showTalkIcon = target.canTalk && target.type !== 'feed';
  const userOnline =
    target.type !== 'user' || peers.some((peer) => peer.kind === 'user' && peer.userId === target.id);
  const { offline: dimmed, receiving } = targetActivity({
    type: target.type, incoming, feedOnline, feedStopped, userOnline,
  });
  const listenOnly = target.type === 'conference' && !target.canTalk;
  const tight = compact || (height != null && height < 64);

  const speaking = receiving;
  const muted = preference.muted || radioSuppressed;

  const meta =
    target.type === 'feed'
      ? !feedOnline
        ? 'Offline'
        : feedStopped
          ? 'Stopped'
          : // TalkToMe 1.5.17: the green border already says it is streaming.
            'Feed'
      : target.type === 'conference'
        ? speaking
          ? conferenceSpeakingLabel(target, incomingEntries, peers)
          : listenOnly
            ? 'Listen only'
            : 'Conference'
        : userOnline
          ? speaking
            ? 'Speaking'
            : 'Online'
          : 'Offline';

  const avatarColor = dimmed ? WEB_AVATAR.offlineGlyph : WEB_AVATAR.glyph;
  const avatar = target.type === 'conference' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose who you hear in ${target.label}`}
        onPress={() => onOpenConferenceMembers?.(target)}
        style={dense ? styles.conferenceCompactHit :
          [styles.avatar, { backgroundColor: targetAvatarBackground('conference', dimmed) }]}
      >
        {dense ? (
          <View pointerEvents="none" style={[styles.conferenceCompactIcon, { backgroundColor: targetAvatarBackground('conference', dimmed) }]}>
            <ConferenceIcon size={13} />
          </View>
        ) : <ConferenceIcon />}
        {listenOnly && !dense ? (
          <View style={styles.listenBadge}>
            <ListenOnlyIcon color={colors.muted} size={10} />
          </View>
        ) : null}
      </Pressable>
    ) : dense ? null : canToggleVideo ? (
      <View pointerEvents="none" style={[styles.avatar, { backgroundColor: targetAvatarBackground('feed', dimmed) }]}>
        <Text style={{ fontSize: 22 }}>📺</Text>
      </View>
    ) : (
      <View style={[styles.avatar, { backgroundColor: targetAvatarBackground(target.type, dimmed) }]}>
        {target.type === 'feed' ? (
          <HeadphonesIcon />
        ) : (
          <PersonIcon color={avatarColor} letter={target.label} />
        )}
      </View>
    );

  const showCompactStatus = receiving || dimmed || listenOnly || (target.type === 'feed' && feedStopped);
  const identity = (
    <View style={styles.identity} pointerEvents="none">
      <View style={[styles.nameRow, dense && styles.nameRowDense]}>
        {hardwarePtt ? <PttButtonIcon size={dense ? 12 : 14} /> : null}
        {locked ? <LockIcon color={colors.text} size={dense ? 12 : 14} /> : null}
        <Text
          style={[
            styles.label,
            compactLabel && styles.labelCompact,
            dense && styles.labelDense,
            largerText && styles.labelLarge,
            dimmed && styles.dimText,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {target.label}
        </Text>
        {dense && showCompactStatus ? <Text style={styles.metaDense} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {!dense ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
    </View>
  );

  const wrapTalk = (children: ReactNode, style: StyleProp<ViewStyle>, accessibilityLabel: string, keypad = false) => {
    if (canTalk) {
      return (
        <HoldToTalk
          accessibilityLabel={`${locked ? `Unlock ${target.label}` : accessibilityLabel}${hardwarePtt ? ', hardware PTT target' : ''}`}
          nativeID={keypad ? `operator-talk:${key}` : undefined}
          disabled={!canTalk}
          locked={locked}
          leftHanded={leftHanded}
          tapToLock={tapToLock}
          onPress={(inputKey) => void session.pressTalk(target, inputKey)}
          onLock={() => void session.lockTalk(target)}
          onRelease={(inputKey) => void session.releaseTalk(target, inputKey)}
          style={style}
        >
          {children}
        </HoldToTalk>
      );
    }
    return <View pointerEvents={canToggleVideo ? "none" : "auto"} style={style}>{children}</View>;
  };

  const talkZone = wrapTalk(
    identity,
    [styles.talkZone, dense && styles.talkZoneDense, talking && styles.talkZoneActive],
    `Talk to ${target.label}`,
    true,
  );

  const edgeIconColor = talking || keyboardHeld ? colors.talking : dimmed ? 'rgba(255,255,255,0.28)' : colors.text;
  const talkSlotStyle = [styles.talkControl, edgeTalkAffordance && styles.edgeTalk];

  const talkControl = target.type === 'feed' ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={feedStopped ? 'Start receiving feed' : 'Stop receiving feed'}
      accessibilityState={{ disabled: !feedOnline, selected: feedStopped }}
      disabled={!feedOnline}
      onPress={() => session.toggleFeedReception(target)}
      style={[...talkSlotStyle, styles.feedButton, dense && styles.feedButtonDense, dimmed && styles.controlOffline]}
    >
      {feedStopped ? (
        <PlayIcon color={feedOnline ? colors.text : WEB_AVATAR.offlineGlyph} size={dense ? 14 : 18} />
      ) : (
        <StopIcon color={colors.text} size={dense ? 12 : 14} />
      )}
    </Pressable>
  ) : dense ? null : showTalkIcon ? (
    wrapTalk(
      <WalkieTalkieIcon color={edgeIconColor} size={tight ? 18 : 22} />,
      [...talkSlotStyle, talking && styles.talkZoneActive],
      edgeTalkAffordance ? `Talk to ${target.label} from the phone edge` : `Talk to ${target.label}`,
    )
  ) : (
    <View style={talkSlotStyle} />
  );

  const rowStyle = [
    styles.row,
    leftHanded && styles.rowLeft,
    tight && styles.rowCompact,
    dense && styles.rowDense,
    dimmed && styles.rowOffline,
    (talking || keyboardHeld) && styles.rowTalking,
    speaking && !talking && !keyboardHeld && styles.rowSpeaking,
    adjustingVolume && styles.rowAdjusting,
    height != null ? { height, minHeight: height, flex: 1, paddingVertical: dense ? 1 : tight ? 4 : 8 } : null,
  ];

  return (
    <View nativeID={`operator-card:${key}`} collapsable={false} focusable={!canTalk} style={[otherVolumeAdjusting && { opacity: 0.3 }, videoExpanded ? [styles.videoCard, speaking && styles.rowSpeaking, dimmed && styles.rowOffline,
      height != null && { height: height + videoHeight }] : height != null ? { height } : undefined]}>
      {canToggleVideo ? <Pressable
        accessibilityRole="button" accessibilityLabel={`${videoExpanded ? 'Hide' : 'Show'} video, ${target.label}`}
        accessibilityState={{ expanded: videoExpanded }} onPress={onToggleVideo}
        style={StyleSheet.absoluteFill}
      /> : null}
      {videoExpanded ? <View pointerEvents="none"><FeedVideoPlayer streamURL={videoStreamURL} error={videoError}
        stopped={feedStopped} height={Math.max(0, videoHeight - 2)} /></View> : null}
    <View pointerEvents={canToggleVideo ? "box-none" : "auto"} style={[rowStyle, videoExpanded && { flex: 0, borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', opacity: 1 }]}>
      {avatar}
      {talkZone}
      <View
        pointerEvents={canToggleVideo ? "box-none" : "auto"}
        style={[
          styles.meterCluster,
          leftHanded && styles.meterClusterLeft,
          volumeReadout && styles.meterClusterReadout,
        ]}
      >
        <VolumeRing
          level={preference.volume}
          muted={muted}
          dimmed={dimmed}
          compact={tight}
          dense={dense}
          largerReadout={largerText}
          variant={volumeReadout ? 'readout' : 'ring'}
          accessibilityLabel={
            radioSuppressed ? `Muted by Radio mode, ${target.label}`
              : muted ? `Volume muted, ${target.label}` : `Volume ${formatLinearLevelDb(preference.volume)}`
          }
          onPress={onOpenVolume}
          onDoublePress={() => session.toggleTargetMuted(target)}
          onAdjustBegin={point => {
            const current = useSessionStore.getState().audioPreferences[key] ?? DEFAULT_AUDIO_PREFERENCE;
            return beginVolumeAdjustment({ key, title: target.label, level: current.volume, muted: current.muted,
              origin: point, onChange: volume => session.setTargetVolume(target, volume) });
          }}
          onAdjustMove={point => moveVolumeAdjustment(key, point)}
          onAdjustEnd={() => endVolumeAdjustment(key)}
        />
      </View>
      {talkControl}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  videoCard: { borderRadius: 6, overflow: 'hidden', backgroundColor: '#1f2937',
    borderWidth: 1, borderColor: 'transparent' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  rowAdjusting: {
    opacity: 1,
    borderColor: colors.accent,
    backgroundColor: '#12334a',
  },
  rowLeft: {
    flexDirection: 'row-reverse',
  },
  rowCompact: {
    minHeight: 62,
    paddingHorizontal: 8,
  },
  rowDense: { gap: 4, paddingHorizontal: 7 },
  labelDense: { fontSize: 12 },
  labelLarge: { fontSize: 15 },
  nameRowDense: { gap: 4 },
  metaDense: { color: colors.muted, fontSize: 10, flexShrink: 1, maxWidth: '48%' },
  talkZoneDense: { minHeight: 0 },
  conferenceCompactHit: { width: 24, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  conferenceCompactIcon: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  feedButtonDense: { minHeight: 0, minWidth: 32, width: 32 },
  rowTalking: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderColor: 'rgba(139,92,246,0.8)',
  },
  rowSpeaking: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.8)',
  },
  rowOffline: {
    opacity: 0.6,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(15,23,42,0.35)',
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
  labelCompact: {
    fontSize: 14,
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
  feedButton: {
    minWidth: 40,
    minHeight: 40,
  },
  controlOffline: {
    opacity: 0.55,
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
