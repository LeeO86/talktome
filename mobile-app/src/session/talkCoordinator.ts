import { canTalkToTarget, talkTargetIdentity, type TalkTarget } from '../protocol';
import { mainButtonStorageKey, resolveMainButton, type ResolvedMainButton } from './mainButton';
import {
  saveConferenceListen,
  setConferenceMemberLevel as nextConferenceMemberLevel,
  setConferenceMemberListening as nextConferenceMemberListening,
  type ConferenceListenState,
} from './conferenceListen';
import { updatePttRemoteParticipant } from '../ptt/native';
import { resolveReplyTalkTarget } from '../talk/replyTarget';
import { loadTalkLinkToken, talkLinkAuthorizes } from '../talk/talkLink';
import { addTalkTarget, removeTalkTarget, talkTargetKeys } from '../talk/talkSet';
import { HOLD_HINT, latestIncomingName, useSessionStore } from './state';
import type { SessionController } from './sessionController';

/** Press/lock/release talk, the main button, and conference listen. */
export class TalkCoordinator {
  constructor(private readonly c: SessionController) {}

  canTalkTo(target: TalkTarget): boolean {
    return canTalkToTarget(target, useSessionStore.getState().peers);
  }

  async pressTalk(target: TalkTarget): Promise<void> {
    if (!this.canTalkTo(target)) {
      useSessionStore.setState({
        error: target.type === 'user' ? 'This target is currently offline.' : 'This target is listen-only.',
      });
      return;
    }
    const media = this.c.media;
    if (!media) {
      useSessionStore.setState({ error: 'Media is not ready.' });
      return;
    }

    await this.c.background.prepareAudioForTalk();

    const key = talkTargetIdentity(target);
    const state = useSessionStore.getState();
    if (state.talkLocked && state.lockedTargetKeys.includes(key) && this.c.overrideFrom === null) {
      // Tapping a locked target: with multi-lock drop just that lock,
      // otherwise stop talking entirely (single-lock web behavior).
      if (state.lockMultipleTargets && this.c.lockedTargets.length > 1) {
        await this.removeLock(target);
        return;
      }
      await this.unlockTalk();
      return;
    }

    if (state.talkLocked && !state.talkingTargetKeys.includes(key)) {
      if (state.lockMultipleTargets) {
        // Multi-lock: hold an extra target on top of the locked set.
        this.c.talkingTargets = addTalkTarget(this.c.talkingTargets, target);
        this.publishTalkState(true);
        try {
          await media.startTalking(this.c.talkingTargets, true);
        } catch (error) {
          this.failTalk(error);
        }
        return;
      }
      this.c.overrideFrom = this.c.lockedTargets.length > 0 ? this.c.lockedTargets : this.c.talkingTargets;
      this.c.talkingTargets = [target];
      this.publishTalkState(true);
      try {
        await media.startTalking(this.c.talkingTargets, false);
      } catch (error) {
        this.failTalk(error);
      }
      return;
    }

    this.c.talkingTargets = addTalkTarget(this.c.talkingTargets, target);
    this.publishTalkState(state.talkLocked);
    try {
      await media.startTalking(this.c.talkingTargets, state.talkLocked);
    } catch (error) {
      this.failTalk(error);
    }
  }

  async lockTalk(target: TalkTarget): Promise<void> {
    const media = this.c.media;
    if (!this.canTalkTo(target) || !media) {
      return;
    }
    await this.c.background.prepareAudioForTalk();
    this.c.talkingTargets = addTalkTarget(this.c.talkingTargets, target);
    // Multi-lock adds this target to the existing lock set; single-lock
    // locks the whole current talking set (previous locks were already
    // replaced by the pressTalk override path).
    this.c.lockedTargets =
      useSessionStore.getState().lockMultipleTargets && this.c.lockedTargets.length > 0
        ? addTalkTarget(this.c.lockedTargets, target)
        : this.c.talkingTargets;
    this.c.overrideFrom = null;
    this.publishTalkState(true);
    try {
      await media.startTalking(this.c.talkingTargets, true);
      useSessionStore.setState({
        statusMessage: `Locked to ${this.c.talkingTargets.map((item) => item.label).join(', ')}.`,
      });
    } catch (error) {
      this.failTalk(error);
    }
  }

  async releaseTalk(target?: TalkTarget): Promise<void> {
    if (this.c.overrideFrom) {
      this.c.talkingTargets = this.c.overrideFrom;
      this.c.lockedTargets = this.c.overrideFrom;
      this.c.overrideFrom = null;
      this.publishTalkState(true);
      this.c.media?.syncTalkTargets(this.c.talkingTargets, true);
      useSessionStore.setState({
        statusMessage: `Locked to ${this.c.talkingTargets.map((item) => item.label).join(', ')}.`,
      });
      return;
    }

    const lockedState = useSessionStore.getState();
    if (lockedState.talkLocked) {
      // Multi-lock: releasing a held (unlocked) target drops only that
      // target; the locked set keeps transmitting.
      if (
        target &&
        lockedState.lockMultipleTargets &&
        !lockedState.lockedTargetKeys.includes(talkTargetIdentity(target)) &&
        lockedState.talkingTargetKeys.includes(talkTargetIdentity(target))
      ) {
        this.c.talkingTargets = removeTalkTarget(this.c.talkingTargets, target);
        this.publishTalkState(true);
        this.c.media?.syncTalkTargets(this.c.talkingTargets, true);
      }
      return;
    }

    if (target) {
      this.c.talkingTargets = removeTalkTarget(this.c.talkingTargets, target);
      if (this.c.talkingTargets.length > 0) {
        this.publishTalkState(false);
        this.c.media?.syncTalkTargets(this.c.talkingTargets, false);
        return;
      }
    }

    try {
      await this.c.media?.stopTalking();
    } finally {
      this.c.talkingTargets = [];
      this.c.lockedTargets = [];
      this.publishTalkState(false);
      useSessionStore.setState({ statusMessage: HOLD_HINT });
    }
  }

  async pressReply(): Promise<void> {
    const reply = this.replyTalkTarget();
    if (!reply) {
      useSessionStore.setState({ error: 'No one to reply to.' });
      return;
    }
    await this.pressTalk(reply);
  }

  async lockReply(): Promise<void> {
    const reply = this.replyTalkTarget();
    if (!reply) {
      return;
    }
    await this.lockTalk(reply);
  }

  replyTalkTarget(): TalkTarget | null {
    return useSessionStore.getState().replyTarget;
  }

  resolvedMainButton(): ResolvedMainButton {
    const state = useSessionStore.getState();
    return resolveMainButton({
      storedIdentity: state.mainButtonTargets[mainButtonStorageKey(state.activeProfileId, state.productionId)],
      targets: state.targets,
      replyTarget: state.replyTarget,
      canTalk: (target) => this.canTalkTo(target),
    });
  }

  async pressMainButton(): Promise<void> {
    const resolved = this.resolvedMainButton();
    if (!resolved.target) {
      useSessionStore.setState({
        error: resolved.unavailable ? 'That main button target is unavailable.' : 'No one to reply to.',
      });
      return;
    }
    if (resolved.mode === 'reply') {
      await this.pressReply();
      return;
    }
    await this.pressTalk(resolved.target);
  }

  async lockMainButton(): Promise<void> {
    const resolved = this.resolvedMainButton();
    if (!resolved.target) {
      return;
    }
    if (resolved.mode === 'reply') {
      await this.lockReply();
      return;
    }
    await this.lockTalk(resolved.target);
  }

  firstTalkableTarget(): TalkTarget | null {
    return useSessionStore.getState().targets.find((target) => this.canTalkTo(target)) ?? null;
  }

  async toggleCurrentTalk(): Promise<void> {
    const state = useSessionStore.getState();
    if (!state.operatorReady) {
      return;
    }
    if (state.talking || state.talkLocked) {
      await this.unlockTalk();
      return;
    }
    await this.lockMainButton();
  }

  handleTalkUrl(url: string): void {
    void this.acceptTalkUrl(url);
  }

  private async acceptTalkUrl(url: string): Promise<void> {
    const token = await loadTalkLinkToken().catch(() => null);
    if (!talkLinkAuthorizes(url, token) || !useSessionStore.getState().operatorReady) {
      return;
    }
    void this.toggleCurrentTalk();
  }

  setConferenceMemberListening(conferenceId: number | string, userId: number, listening: boolean): void {
    const next = nextConferenceMemberListening(
      useSessionStore.getState().conferenceListen,
      conferenceId,
      userId,
      listening,
    );
    this.applyConferenceListen(next);
  }

  setConferenceMemberLevel(conferenceId: number | string, userId: number, level: number): void {
    const next = nextConferenceMemberLevel(
      useSessionStore.getState().conferenceListen,
      conferenceId,
      userId,
      level,
    );
    this.applyConferenceListen(next);
  }

  private applyConferenceListen(next: ConferenceListenState): void {
    useSessionStore.setState({ conferenceListen: next });
    this.c.media?.setConferenceListen(next);
    void saveConferenceListen(next);
  }

  refreshReplyTarget(): void {
    const state = useSessionStore.getState();
    const replyTarget = resolveReplyTalkTarget({
      incoming: state.incoming,
      targets: state.targets,
      peers: state.peers,
      lastReply: state.replyTarget,
      fallback: this.firstTalkableTarget(),
    });
    useSessionStore.setState({ replyTarget });
    const incomingName = latestIncomingName(state.incoming);
    void updatePttRemoteParticipant(incomingName ?? replyTarget?.label ?? null);
    this.c.background.syncPresence();
  }

  /** Drops one lock from a multi-lock set; stops talking if it was the last. */
  private async removeLock(target: TalkTarget): Promise<void> {
    this.c.lockedTargets = removeTalkTarget(this.c.lockedTargets, target);
    this.c.talkingTargets = removeTalkTarget(this.c.talkingTargets, target);
    if (this.c.talkingTargets.length === 0) {
      await this.unlockTalk();
      return;
    }
    this.publishTalkState(this.c.lockedTargets.length > 0);
    this.c.media?.syncTalkTargets(this.c.talkingTargets, this.c.lockedTargets.length > 0);
  }

  /** Called when multi-lock is switched off while several locks are active. */
  async collapseToSingleLock(): Promise<void> {
    const keep = this.c.lockedTargets[0];
    if (this.c.lockedTargets.length <= 1 || !keep) {
      return;
    }
    this.c.lockedTargets = [keep];
    this.c.talkingTargets = [keep];
    this.publishTalkState(true);
    this.c.media?.syncTalkTargets(this.c.talkingTargets, true);
    useSessionStore.setState({ statusMessage: `Locked to ${keep.label}.` });
  }

  async unlockTalk(target?: TalkTarget): Promise<void> {
    if (
      target &&
      useSessionStore.getState().lockMultipleTargets &&
      this.c.lockedTargets.length > 1 &&
      this.c.lockedTargets.some((item) => talkTargetIdentity(item) === talkTargetIdentity(target))
    ) {
      await this.removeLock(target);
      return;
    }
    try {
      await this.c.media?.stopTalking();
    } finally {
      this.c.talkingTargets = [];
      this.c.lockedTargets = [];
      this.c.overrideFrom = null;
      this.publishTalkState(false);
      useSessionStore.setState({ statusMessage: HOLD_HINT });
    }
  }

  private failTalk(error: unknown): void {
    this.c.talkingTargets = [];
    this.c.lockedTargets = [];
    this.c.overrideFrom = null;
    this.publishTalkState(false);
    useSessionStore.setState({
      error: error instanceof Error ? error.message : String(error),
      statusMessage: 'PTT could not start.',
    });
  }

  publishTalkState(locked: boolean): void {
    const keys = talkTargetKeys(this.c.talkingTargets);
    const lockedKeys = talkTargetKeys(this.c.lockedTargets);
    const overriding = this.c.overrideFrom !== null;
    useSessionStore.setState({
      talking: this.c.talkingTargets.length > 0,
      talkLocked: locked && this.c.lockedTargets.length > 0,
      talkingTargetKeys: keys,
      lockedTargetKeys: locked ? lockedKeys : [],
      error: null,
      statusMessage:
        this.c.talkingTargets.length > 0
          ? locked && !overriding
            ? `Locked to ${this.c.talkingTargets.map((item) => item.label).join(', ')}.`
            : `Talking to ${this.c.talkingTargets.map((item) => item.label).join(', ')}…`
          : HOLD_HINT,
    });
    this.c.background.syncPresence();
    this.c.mediaCoordinator.syncFeedDucking();
  }
}
