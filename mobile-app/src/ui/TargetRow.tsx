import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_AUDIO_PREFERENCE, talkTargetIdentity, type TalkTarget } from '../protocol';
import { session, useSessionStore } from '../session/store';
import { incomingHighlightsTarget } from '../talk/replyTarget';
import { HoldToTalk } from './HoldToTalk';
import { ConferenceIcon, HeadphonesIcon, LockIcon, MicIcon, PersonIcon, SpeakerIcon, StopIcon } from './icons';
import { colors } from './theme';
import { VolumeSlider } from './VolumeSlider';

type Props = {
  target: TalkTarget;
  compact?: boolean;
  onOpenConferenceMembers?: (target: TalkTarget) => void;
};

export function TargetRow({ target, compact = false, onOpenConferenceMembers }: Props) {
  const key = talkTargetIdentity(target);
  const talking = useSessionStore((state) => state.talkingTargetKeys.includes(key));
  const locked = useSessionStore((state) => state.talkLocked && state.talkingTargetKeys.includes(key));
  const speaking = useSessionStore((state) => state.speakingTargetKeys.includes(key));
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
  const talkSelectMode = useSessionStore((state) => state.talkSelectMode);
  const selected = useSessionStore(
    (state) =>
      Boolean(state.selectedTalkTarget) &&
      talkTargetIdentity(state.selectedTalkTarget!) === key,
  );
  const canTalk = session.canTalkTo(target);
  const userOnline =
    target.type !== 'user' || peers.some((peer) => peer.kind === 'user' && peer.userId === target.id);
  const dimmed = target.type === 'feed' ? !feedOnline : target.type === 'user' && !userOnline;
  const talkSize = compact ? 56 : 48;

  const meta =
    target.type === 'feed'
      ? !feedOnline
        ? 'Offline'
        : feedStopped
          ? 'Stopped'
          : speaking
            ? 'Streaming'
            : 'Feed'
      : target.type === 'conference'
        ? target.canTalk
          ? speaking || incoming
            ? 'Speaking'
            : 'Conference'
          : 'Listen only'
        : userOnline
          ? speaking || incoming
            ? 'Speaking'
            : 'Online'
          : 'Offline';

  const iconColor = dimmed ? 'rgba(255,255,255,0.28)' : speaking || incoming ? colors.speaking : colors.accent;

  const talkControl =
    target.type === 'feed' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={feedStopped ? 'Start feed' : 'Stop feed'}
        onPress={() => session.toggleFeedReception(target)}
        style={[styles.circle, compact && { width: talkSize, height: talkSize, borderRadius: 12 }]}
      >
        <StopIcon color={colors.text} />
      </Pressable>
    ) : target.canTalk && !talkSelectMode ? (
      <HoldToTalk
        accessibilityLabel={locked ? `Unlock ${target.label}` : `Talk to ${target.label}`}
        disabled={!canTalk}
        locked={locked}
        leftHanded={leftHanded}
        onPress={() => void session.pressTalk(target)}
        onLock={() => void session.lockTalk(target)}
        onRelease={() => void session.releaseTalk(target)}
        style={[
          styles.talk,
          compact && styles.talkCompact,
          { width: talkSize, height: talkSize },
          (talking || locked) && styles.talkActive,
          !canTalk && styles.circleDim,
        ]}
      >
        {locked ? (
          <LockIcon color={colors.text} />
        ) : (
          <MicIcon color={!canTalk ? 'rgba(255,255,255,0.28)' : colors.text} />
        )}
      </HoldToTalk>
    ) : (
      <View style={[styles.circle, compact && { width: talkSize, height: talkSize }, selected && styles.selectedMark]} />
    );

  const muteControl = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={preference.muted ? 'Unmute' : 'Mute'}
      disabled={dimmed}
      onPress={() => session.toggleTargetMuted(target)}
      style={[styles.circle, preference.muted && styles.muteActive, dimmed && styles.circleDim]}
    >
      <SpeakerIcon muted={preference.muted} color={dimmed ? 'rgba(255,255,255,0.28)' : colors.text} />
    </Pressable>
  );

  const avatar =
    target.type === 'conference' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose who you hear in ${target.label}`}
        onPress={() => onOpenConferenceMembers?.(target)}
        style={[styles.avatar, { backgroundColor: dimmed ? 'rgba(255,255,255,0.04)' : 'rgba(61,214,245,0.12)' }]}
      >
        <ConferenceIcon color={iconColor} />
      </Pressable>
    ) : (
      <View style={[styles.avatar, { backgroundColor: dimmed ? 'rgba(255,255,255,0.04)' : 'rgba(61,214,245,0.12)' }]}>
        {target.type === 'feed' ? <HeadphonesIcon color={iconColor} /> : <PersonIcon color={iconColor} />}
      </View>
    );

  const body = (
    <>
      {avatar}
      <View style={styles.identity} pointerEvents="none">
        <Text style={[styles.label, dimmed && styles.dimText]} numberOfLines={1}>
          {target.label}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <VolumeSlider
        value={preference.volume}
        disabled={dimmed || preference.muted}
        onChange={(volume) => session.setTargetVolume(target, volume)}
      />
      {leftHanded ? (
        <>
          {talkControl}
          {muteControl}
        </>
      ) : (
        <>
          {muteControl}
          {talkControl}
        </>
      )}
    </>
  );

  const rowStyle = [
    styles.row,
    leftHanded && styles.rowLeft,
    compact && styles.rowCompact,
    (talking || locked) && styles.rowTalking,
    (speaking || incoming) && !talking && styles.rowSpeaking,
    talkSelectMode && selected && styles.rowSelected,
    dimmed && styles.rowOffline,
  ];

  if (talkSelectMode && canTalk) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select ${target.label}`}
        accessibilityState={{ selected }}
        onPress={() => session.selectTalkTarget(target)}
        style={rowStyle}
      >
        {body}
      </Pressable>
    );
  }

  if (canTalk && !talkSelectMode) {
    return (
      <HoldToTalk
        accessibilityLabel={locked ? `Unlock ${target.label}` : `Talk to ${target.label}`}
        disabled={!canTalk}
        locked={locked}
        leftHanded={leftHanded}
        onPress={() => void session.pressTalk(target)}
        onLock={() => void session.lockTalk(target)}
        onRelease={() => void session.releaseTalk(target)}
        style={rowStyle}
      >
        {body}
      </HoldToTalk>
    );
  }

  return <View style={rowStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    minHeight: 68,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowLeft: {
    flexDirection: 'row-reverse',
  },
  rowCompact: {
    minHeight: 58,
    paddingHorizontal: 8,
  },
  rowTalking: {
    backgroundColor: 'rgba(122,71,199,0.20)',
    borderColor: 'rgba(158,112,230,0.55)',
  },
  rowSpeaking: {
    borderColor: 'rgba(117,242,184,0.32)',
  },
  rowSelected: {
    backgroundColor: 'rgba(226,59,74,0.16)',
    borderColor: 'rgba(226,59,74,0.62)',
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
  identity: {
    width: 108,
    flexGrow: 1,
    flexShrink: 1,
  },
  label: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  dimText: {
    color: 'rgba(255,255,255,0.55)',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  talk: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  talkCompact: {
    borderRadius: 12,
  },
  circleDim: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  muteActive: {
    backgroundColor: colors.mute,
  },
  talkActive: {
    backgroundColor: colors.talking,
  },
  selectedMark: {
    backgroundColor: colors.talk,
  },
});
