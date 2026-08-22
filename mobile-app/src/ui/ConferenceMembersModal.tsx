import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  excludeSelfConferenceMembers,
  formatLinearLevelDb,
  nudgeVolume,
  onlineUserIdsFromPeers,
  sortConferenceMembers,
  type TalkTarget,
} from '../protocol';
import { conferenceMemberExcluded, conferenceMemberLevel } from '../session/conferenceListen';
import { session, useSessionStore } from '../session/store';
import { NudgeButton } from './NudgeButton';
import { colors } from './theme';
import { VolumeRing } from './VolumeRing';

type Props = {
  target: TalkTarget | null;
  onClose: () => void;
};

export function ConferenceMembersModal({ target, onClose }: Props) {
  const peers = useSessionStore((state) => state.peers);
  const identityId = useSessionStore((state) => state.identity?.id);
  const listen = useSessionStore((state) => state.conferenceListen);
  const onlineIds = onlineUserIdsFromPeers(peers);
  const members = sortConferenceMembers(
    excludeSelfConferenceMembers(target?.members, identityId),
    onlineIds,
  );

  const nudgeMember = (userId: number, direction: 1 | -1) => {
    if (!target) {
      return;
    }
    const current = conferenceMemberLevel(useSessionStore.getState().conferenceListen, target.id, userId);
    session.setConferenceMemberLevel(target.id, userId, nudgeVolume(current, direction));
  };

  return (
    <Modal visible={Boolean(target)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.description}>
            Choose who you hear in {target?.label ?? 'this conference'}.
          </Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {members.length === 0 ? (
              <Text style={styles.empty}>No other members</Text>
            ) : (
              members.map((member) => {
                const online = onlineIds.has(member.userId);
                const listening = !conferenceMemberExcluded(listen, target?.id ?? 0, member.userId);
                const level = conferenceMemberLevel(listen, target?.id ?? 0, member.userId);
                return (
                  <View
                    key={member.userId}
                    style={[
                      styles.member,
                      !online && styles.memberOffline,
                      !listening && styles.memberMuted,
                    ]}
                  >
                    <View style={styles.memberText}>
                      <Text style={[styles.memberName, !online && styles.offlineText]} numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={styles.onlineState}>
                        {!listening ? 'Muted' : online ? 'Online' : 'Offline'}
                      </Text>
                    </View>
                    <NudgeButton
                      accessibilityLabel={`Quieter ${member.name}`}
                      onNudge={() => nudgeMember(member.userId, -1)}
                      style={styles.nudge}
                      textStyle={styles.nudgeText}
                    >
                      {'−'}
                    </NudgeButton>
                    <VolumeRing
                      level={level}
                      muted={!listening}
                      dimmed={!online}
                      compact
                      accessibilityLabel={`Volume ${formatLinearLevelDb(listening ? level : 0)}`}
                      onDoublePress={() =>
                        target
                          ? session.setConferenceMemberListening(target.id, member.userId, !listening)
                          : undefined
                      }
                    />
                    <NudgeButton
                      accessibilityLabel={`Louder ${member.name}`}
                      onNudge={() => nudgeMember(member.userId, 1)}
                      style={styles.nudge}
                      textStyle={styles.nudgeText}
                    >
                      {'+'}
                    </NudgeButton>
                  </View>
                );
              })
            )}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    maxHeight: '80%',
    borderRadius: 16,
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    zIndex: 1,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 4,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  member: {
    minHeight: 56,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberOffline: {
    opacity: 0.78,
  },
  memberMuted: {
    opacity: 0.85,
  },
  memberText: {
    flexGrow: 1,
    flexShrink: 1,
  },
  memberName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  offlineText: {
    color: 'rgba(148, 163, 184, 0.92)',
  },
  onlineState: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  nudge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(61,214,245,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(61,214,245,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
    marginTop: -1,
  },
  done: {
    margin: 16,
    marginTop: 8,
    backgroundColor: 'rgba(61,214,245,0.18)',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
});
