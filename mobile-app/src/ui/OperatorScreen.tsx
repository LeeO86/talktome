import { useEffect, useRef, useState } from 'react';
import { Pressable, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { iosPttEnabled } from '../audio/policy';
import {
  cameraTallyColor,
  cameraTallyLabel,
  visibleProductionName,
  talkTargetIdentity,
  type TalkTarget,
} from '../protocol';
import { operatorPttNotice, shouldShowPttJoinBanner } from '../ptt/policy';
import { connectionHealthFromSession } from '../session/connectionHealth';
import { mainButtonStorageKey, resolveMainButton } from '../session/mainButton';
import { session, useSessionStore } from '../session/store';
import { slideToLockHint } from '../talk/slideToLock';
import { ConferenceMembersModal } from './ConferenceMembersModal';
import { AudioRouteButton } from './AudioRouteButton';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { ChevronIcon, LockIcon, ReplyArrowIcon, WalkieTalkieIcon } from './icons';
import { HoldToTalk } from './HoldToTalk';
import {
  chunkTargets,
  COLLAPSED_HEADER_HEIGHT,
  estimateTargetListHeight,
  isCompactOperatorScreen,
  isTabletOperatorScreen,
  operatorLayout,
  shouldOfferHeaderCollapse,
  targetLayerCount,
  visibleTargets,
} from './layers';
import { SettingsScreen } from './SettingsScreen';
import { TargetRow } from './TargetRow';
import { colors } from './theme';

export function OperatorScreen() {
  const store = useSessionStore();
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const width = measured.width || window.width;
  const height = measured.height || window.height;
  const compact = isCompactOperatorScreen(width, height);
  const tablet = isTabletOperatorScreen(width, height);
  const [layerIndex, setLayerIndex] = useState(0);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [conferenceTarget, setConferenceTarget] = useState<TalkTarget | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(compact);
  const [headerHeight, setHeaderHeight] = useState(96);
  const [listHeight, setListHeight] = useState(0);
  const compactRef = useRef(compact);
  const reply = store.replyTarget;
  const mainButton = resolveMainButton({
    storedIdentity: store.mainButtonTargets[mainButtonStorageKey(store.activeProfileId, store.productionId)],
    targets: store.targets,
    replyTarget: reply,
    canTalk: (target) => session.canTalkTo(target),
  });
  const availableHeight = listHeight || estimateTargetListHeight(width, height, headerCollapsed);
  const layout = operatorLayout({
    width,
    height,
    availableHeight,
    headerCollapsed,
  });
  const replyBeside = layout.replyBeside;
  const layers = targetLayerCount(store.targets.length, width, height, availableHeight, headerCollapsed);
  const safeLayerIndex = Math.min(layerIndex, layers - 1);
  const page = visibleTargets(store.targets, safeLayerIndex, width, height, availableHeight, headerCollapsed);
  const grid = chunkTargets(page, layout.columns);
  const offerCollapse =
    headerCollapsed ||
    shouldOfferHeaderCollapse({
      rows: layout.rows,
      availableHeight,
      headerHeight,
      maxRows: layout.maxRows,
      compact,
    });

  useEffect(() => {
    setLayerIndex(0);
  }, [store.productionId, store.targets.length, layout.columns, replyBeside]);

  useEffect(() => {
    if (compactRef.current === compact) {
      return;
    }
    compactRef.current = compact;
    setHeaderCollapsed(compact);
  }, [compact]);

  const collapseHeader = () => {
    setHeaderCollapsed(true);
  };
  const expandHeader = () => {
    setHeaderCollapsed(false);
  };

  const mainTarget = mainButton.target;
  const mainKey = mainTarget ? talkTargetIdentity(mainTarget) : '';
  const mainTalking = Boolean(mainTarget && store.talking && store.talkingTargetKeys.includes(mainKey));

  const productionLabel = visibleProductionName(store.productionName);
  const connection = connectionHealthFromSession(store);
  const pttNotice = operatorPttNotice({
    platform: Platform.OS,
    pttEnabled: iosPttEnabled(),
    bootstrapEnabled: store.pttBootstrapEnabled,
    joined: store.pttJoined,
    verified: store.pttVerified,
    diagnostic: store.pttDiagnostic,
  });
  const mediaNotice =
    connection.kind === 'warning' || connection.kind === 'failed' ? connection.label : store.audioNotice;
  const tallyColor = cameraTallyColor(store.cameraTally);
  const tallyLabel = cameraTallyLabel(store.cameraTally);
  const mainLocked = Boolean(mainKey && store.lockedTargetKeys.includes(mainKey));

  const layerButton =
    layers > 1 ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => setLayerIndex((current) => (current + 1) % layers)}
        style={[styles.layer, compact && styles.layerCompact]}
      >
        <Text style={styles.layerText}>
          {compact ? `${(safeLayerIndex % layers) + 1}/${layers}` : `Layer ${(safeLayerIndex % layers) + 1}/${layers}`}
        </Text>
      </Pressable>
    ) : null;

  const replyButton = (
    <HoldToTalk
      accessibilityLabel={mainButton.accessibilityLabel}
      disabled={!mainTarget}
      locked={mainLocked}
      leftHanded={store.leftHanded}
      onPress={() => void session.pressMainButton()}
      onLock={() => void session.lockMainButton()}
      onRelease={() => void session.releaseTalk()}
      style={[
        styles.reply,
        replyBeside && styles.replyLandscape,
        compact && !replyBeside && styles.replyCompact,
        store.bigMainButton && styles.replyBig,
        store.bigMainButton && replyBeside && styles.replyBigLandscape,
        mainTalking && styles.replyActive,
        !mainTarget && styles.replyDisabled,
      ]}
    >
      {mainLocked ? (
        <LockIcon color={colors.text} size={store.bigMainButton ? 28 : 22} />
      ) : mainButton.mode === 'target' ? (
        <WalkieTalkieIcon
          color={mainTarget ? colors.text : 'rgba(255,255,255,0.38)'}
          size={store.bigMainButton ? 32 : 22}
        />
      ) : (
        <ReplyArrowIcon
          color={mainTarget ? colors.text : 'rgba(255,255,255,0.38)'}
          size={store.bigMainButton ? 28 : 22}
        />
      )}
      <Text
        numberOfLines={2}
        style={[
          styles.replyText,
          replyBeside && styles.replyTextLandscape,
          store.bigMainButton && styles.replyTextBig,
          !mainTarget && styles.replyMuted,
        ]}
      >
        {mainButton.label}
      </Text>
      {mainTarget && !compact ? (
        <Text style={styles.replyHint}>{slideToLockHint(store.leftHanded)}</Text>
      ) : null}
    </HoldToTalk>
  );

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout;
        setMeasured((current) =>
          current.width === next.width && current.height === next.height
            ? current
            : { width: next.width, height: next.height },
        );
      }}
      style={[
        styles.screen,
        replyBeside && styles.screenLandscape,
        compact && styles.screenCompact,
        tablet && styles.screenTablet,
        headerCollapsed && styles.screenPeek,
      ]}
    >
      {headerCollapsed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show top bar"
          accessibilityHint="Reveals name, connection, audio route, and layers"
          onPress={expandHeader}
          style={styles.headerPeekCard}
        >
          <ChevronIcon color={colors.text} direction="down" size={14} />
        </Pressable>
      ) : (
        <View
          style={[styles.header, compact && styles.headerCompact]}
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Session, ${connection.label}`}
            accessibilityHint="Server, settings, disconnect, and profiles"
            onPress={() => setSessionOpen(true)}
            style={styles.identity}
          >
            <View style={styles.nameRow}>
              <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>
                {store.identity?.name ?? 'talktome'}
              </Text>
              <ConnectionStatusBadge health={connection} compact={compact} />
            </View>
            {productionLabel ? (
              <Text style={styles.production} numberOfLines={1}>
                {productionLabel}
              </Text>
            ) : null}
            {tallyLabel && tallyColor ? (
              <Text
                accessibilityLabel={tallyLabel === 'PGM' ? 'On program' : 'On preview'}
                style={[styles.tallyChip, { color: tallyColor }]}
              >
                {tallyLabel}
              </Text>
            ) : null}
          </Pressable>
          <View style={styles.headerActions}>
            {offerCollapse ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hide top bar"
                accessibilityHint="Gives the target cards more room on small screens"
                onPress={collapseHeader}
                style={[styles.collapseButton, compact && styles.collapseButtonCompact]}
              >
                <ChevronIcon color={colors.text} direction="up" />
              </Pressable>
            ) : null}
            <AudioRouteButton />
            {layerButton}
          </View>
        </View>
      )}

      {mediaNotice ? <Text style={styles.warn}>{mediaNotice}</Text> : null}
      {pttNotice ? <Text style={styles.warn}>{pttNotice}</Text> : null}
      {store.overBudget ? (
        <Text style={styles.warn}>Too many incoming streams — some feeds paused.</Text>
      ) : null}
      {shouldShowPttJoinBanner({
        platform: Platform.OS,
        pttEnabled: iosPttEnabled(),
        bootstrapEnabled: store.pttBootstrapEnabled,
        joined: store.pttJoined,
      }) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Join PushToTalk channel"
          accessibilityHint="Joins Apple's Push to Talk channel when this server has a push key. In-app talk does not need it."
          onPress={() => void session.joinSystemPttChannel()}
          style={styles.pttBanner}
        >
          <Text style={styles.pttBannerTitle}>Optional: system Push to Talk</Text>
          <Text style={styles.pttBannerHint}>
            Only if this server has an Apple push key. Not required to talk, or for the lock screen card.
          </Text>
        </Pressable>
      ) : null}
      {store.error ? <Text style={styles.error}>{store.error}</Text> : null}

      <View
        style={[
          styles.body,
          replyBeside && styles.bodyLandscape,
          replyBeside && store.leftHanded && styles.bodyLandscapeLeft,
        ]}
      >
        <View
          style={styles.list}
          onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}
        >
          {grid.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={[styles.gridRow, { height: layout.cardHeight, gap: layout.gap }]}>
              {row.map((target) => (
                <View key={`${target.type}-${target.id}`} style={styles.gridCell}>
                  <TargetRow
                    target={target}
                    compact={compact || replyBeside}
                    volumeReadout={compact}
                    height={layout.cardHeight}
                    edgeTalkAffordance={!replyBeside && store.edgeTalkAffordance}
                    onOpenConferenceMembers={setConferenceTarget}
                  />
                </View>
              ))}
              {row.length < layout.columns
                ? Array.from({ length: layout.columns - row.length }, (_, index) => (
                    <View key={`pad-${rowIndex}-${index}`} style={styles.gridCell} />
                  ))
                : null}
            </View>
          ))}
        </View>
        {replyButton}
      </View>

      <SettingsScreen visible={sessionOpen} onClose={() => setSessionOpen(false)} />
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
  screenCompact: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
  },
  screenTablet: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  screenPeek: {
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerCompact: {
    marginBottom: 6,
    gap: 6,
  },
  headerPeekCard: {
    height: COLLAPSED_HEADER_HEIGHT,
    marginBottom: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flexGrow: 1,
    flexShrink: 1,
    marginRight: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
    flexShrink: 1,
  },
  nameCompact: {
    fontSize: 22,
  },
  production: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  tallyChip: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  collapseButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  collapseButtonCompact: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  layer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    height: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  layerCompact: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  layerText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  warn: {
    color: colors.danger,
    marginBottom: 8,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  pttBanner: {
    backgroundColor: 'rgba(61,214,245,0.16)',
    borderColor: 'rgba(61,214,245,0.42)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pttBannerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pttBannerHint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  body: {
    flex: 1,
    minHeight: 0,
    gap: 8,
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
    minWidth: 0,
    minHeight: 0,
    justifyContent: 'flex-end',
    gap: 8,
    overflow: 'hidden',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
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
    width: 96,
    minWidth: 88,
    maxWidth: 108,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 8,
    minHeight: 0,
  },
  replyCompact: {
    minHeight: 52,
    paddingHorizontal: 12,
    gap: 8,
  },
  replyBig: {
    minHeight: 112,
    paddingVertical: 16,
    gap: 14,
  },
  replyBigLandscape: {
    width: 148,
    maxWidth: 168,
  },
  replyActive: {
    backgroundColor: 'rgba(122,71,199,0.28)',
    borderColor: 'rgba(158,112,230,0.68)',
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
    fontSize: 14,
    textAlign: 'center',
  },
  replyTextBig: {
    fontSize: 26,
  },
  replyMuted: {
    color: 'rgba(255,255,255,0.5)',
  },
  replyHint: {
    color: colors.muted,
    fontSize: 11,
  },
});
