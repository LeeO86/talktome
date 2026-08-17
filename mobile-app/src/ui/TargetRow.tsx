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
};

export function TargetRow({ target, compact = false }: Props) {
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
  const canTalk = session.canTalkTo(target);
  const online =
    target.type !== 'user' || peers.some((peer) => peer.kind === 'user' && peer.userId === target.id);
  const dimmed = target.type === 'user' && !online;
  const talkSize = compact ? 56 : 48;

  const meta =
    target.type === 'feed'
      ? feedStopped
        ? 'Stopped'
        : 'Feed'
      : target.type === 'conference'
        ? target.canTalk
          ? speaking || incoming
            ? 'Speaking'
            : 'Conference'
          : 'Listen only'
        : online
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
    ) : target.canTalk ? (
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
      <View style={[styles.circle, compact && { width: talkSize, height: talkSize }]} />
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

  return (
    <View
      style={[
        styles.row,
        leftHanded && styles.rowLeft,
        compact && styles.rowCompact,
        (talking || locked) && styles.rowTalking,
        (speaking || incoming) && !talking && styles.rowSpeaking,
        dimmed && styles.rowOffline,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: dimmed ? 'rgba(255,255,255,0.04)' : 'rgba(61,214,245,0.12)' }]}>
        {target.type === 'conference' ? (
          <ConferenceIcon color={iconColor} />
        ) : target.type === 'feed' ? (
          <HeadphonesIcon color={iconColor} />
        ) : (
          <PersonIcon color={iconColor} />
        )}
      </View>

      <View style={styles.identity}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
