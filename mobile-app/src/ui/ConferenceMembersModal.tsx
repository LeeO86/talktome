import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  excludeSelfConferenceMembers,
  formatLinearLevelDb,
  onlineUserIdsFromPeers,
  sortConferenceMembers,
  type TalkTarget,
} from '../protocol';
import { conferenceMemberExcluded, conferenceMemberLevel } from '../session/conferenceListen';
import { session, useSessionStore } from '../session/store';
import { colors } from './theme';
import { VolumeSlider } from './VolumeSlider';

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

  return (
    <Modal
      visible={Boolean(target)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
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
                    style={[styles.member, !online && styles.memberOffline, !listening && styles.memberMuted]}
                  >
                    <View style={styles.memberTop}>
                      <Switch
                        value={listening}
                        onValueChange={(value) => {
                          if (target) {
                            session.setConferenceMemberListening(target.id, member.userId, value);
                          }
                        }}
                        trackColor={{ true: '#22c55e' }}
                      />
                      <Text style={[styles.memberName, !online && styles.offlineText]} numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={styles.onlineState}>{online ? 'Online' : 'Offline'}</Text>
                    </View>
                    <View style={styles.levelRow}>
                      <VolumeSlider
                        value={level}
                        disabled={!listening}
                        flex
                        onChange={(value) => {
                          if (target) {
                            session.setConferenceMemberLevel(target.id, member.userId, value);
                          }
                        }}
                      />
                      <Text style={styles.db}>{formatLinearLevelDb(listening ? level : 0)}</Text>
                    </View>
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
    borderRadius: 14,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    overflow: 'hidden',
    zIndex: 1,
  },
  description: {
    color: 'rgba(226, 232, 240, 0.7)',
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
    color: 'rgba(148, 163, 184, 0.8)',
    textAlign: 'center',
    paddingVertical: 24,
  },
  member: {
    minHeight: 68,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  memberOffline: {
    opacity: 0.78,
  },
  memberMuted: {
    opacity: 0.62,
  },
  memberTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flexGrow: 1,
    flexShrink: 1,
  },
  offlineText: {
    color: 'rgba(148, 163, 184, 0.92)',
  },
  onlineState: {
    color: 'rgba(148, 163, 184, 0.7)',
    fontSize: 12,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingLeft: 4,
  },
  db: {
    color: 'rgba(226, 232, 240, 0.82)',
    fontSize: 12,
    width: 64,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  done: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
