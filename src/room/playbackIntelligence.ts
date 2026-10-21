import type {TitleRecapMetadata} from '../types/catalog';
import {
  DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG,
  PlaybackIntelligenceConfig,
  PlaybackPolicyAction,
  RecapEligibilityResult,
  RecapOfferState,
  SharedDepartureCheckpoint,
  SoloPauseCheckpoint,
  AttentionDistractionCheckpoint,
  AttentionReplayOfferState,
} from '../types/playbackIntelligence';

export {DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG};
export type {
  PlaybackIntelligenceConfig,
  PlaybackPolicyAction,
  RecapEligibilityResult,
  RecapOfferState,
  SharedDepartureCheckpoint,
  SoloPauseCheckpoint,
  AttentionDistractionCheckpoint,
  AttentionReplayOfferState,
};

/**
 * Normalizes playback progress as a fraction between 0.0 and 1.0.
 * Safely handles unknown, zero, or negative durations.
 */
export const calculateProgress = (
  positionSec: number,
  durationSec: number,
): number => {
  if (
    !durationSec ||
    isNaN(durationSec) ||
    durationSec <= 0 ||
    !positionSec ||
    isNaN(positionSec) ||
    positionSec <= 0
  ) {
    return 0;
  }
  return Math.min(1, Math.max(0, positionSec / durationSec));
};

/**
 * Calculates the missed content progress fraction between departure and current playhead.
 * Always clamped to [0, 1] and strictly safe against division by zero.
 */
export const calculateMissedProgress = (
  departurePositionSec: number,
  currentPositionSec: number,
  durationSec: number,
): number => {
  if (
    !durationSec ||
    isNaN(durationSec) ||
    durationSec <= 0 ||
    isNaN(departurePositionSec) ||
    isNaN(currentPositionSec) ||
    currentPositionSec <= departurePositionSec
  ) {
    return 0;
  }
  const missedSec = currentPositionSec - departurePositionSec;
  return Math.min(1, Math.max(0, missedSec / durationSec));
};

/**
 * Computes the required vote majority for room recap consensus:
 * requiredVotes = Math.ceil(eligibleViewerCount / 2)
 *
 * Examples:
 *  1 viewer  -> 1 vote
 *  2 viewers -> 1 approval
 *  3 viewers -> 2 approvals
 *  4 viewers -> 2 approvals
 *  5 viewers -> 3 approvals
 */
export const calculateRequiredVotes = (eligibleViewerCount: number): number => {
  if (!eligibleViewerCount || eligibleViewerCount <= 1) {
    return 1;
  }
  return Math.ceil(eligibleViewerCount / 2);
};

/**
 * Evaluates whether a returning viewer's absence justifies an optional recap offer.
 * Pure function with zero side effects.
 */
export const isRecapWarranted = ({
  checkpoint,
  currentTitleId,
  currentPositionSec,
  durationSec,
  nowMs,
  config = DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG,
}: {
  checkpoint: SharedDepartureCheckpoint | null;
  currentTitleId: string;
  currentPositionSec: number;
  durationSec: number;
  nowMs: number;
  config?: PlaybackIntelligenceConfig;
}): RecapEligibilityResult => {
  if (!checkpoint) {
    return {
      warranted: false,
      missedProgress: 0,
      missedSec: 0,
      reason: 'no_departure_checkpoint',
    };
  }

  // Checkpoint must belong to the active viewing title
  if (checkpoint.titleId !== currentTitleId) {
    return {
      warranted: false,
      missedProgress: 0,
      missedSec: 0,
      reason: 'title_mismatch',
    };
  }

  // Session wall-clock absence check (distinguish same-session from hours later)
  const absenceWallSec = Math.max(0, (nowMs - checkpoint.departureWallMs) / 1000);
  if (absenceWallSec > config.maxSessionAbsenceSec) {
    return {
      warranted: false,
      missedProgress: 0,
      missedSec: 0,
      reason: 'session_timeout',
    };
  }

  // Safe duration verification
  if (!durationSec || isNaN(durationSec) || durationSec <= 0) {
    return {
      warranted: false,
      missedProgress: 0,
      missedSec: 0,
      reason: 'invalid_duration',
    };
  }

  // Minimum departure progress check (avoid triggering during initial opening logos)
  const departureProgress = calculateProgress(
    checkpoint.departurePositionSec,
    durationSec,
  );
  if (departureProgress < config.minDepartureProgress) {
    return {
      warranted: false,
      missedProgress: 0,
      missedSec: 0,
      reason: 'insufficient_departure_progress',
    };
  }

  // Proportional missed progress check
  const missedProgress = calculateMissedProgress(
    checkpoint.departurePositionSec,
    currentPositionSec,
    durationSec,
  );
  const missedSec = Math.max(0, currentPositionSec - checkpoint.departurePositionSec);

  if (missedProgress < config.minMissedProgress) {
    return {
      warranted: false,
      missedProgress,
      missedSec,
      reason: 'insufficient_missed_progress',
    };
  }

  return {
    warranted: true,
    missedProgress,
    missedSec,
    reason: 'eligible',
  };
};

/**
 * State machine managing room-aware playback intelligence.
 * Completely decoupled from React/UI and native player drivers for deterministic testing.
 */
export class RoomPlaybackEngine {
  public config: PlaybackIntelligenceConfig;
  public titleId: string;
  public durationSec: number;
  public currentPositionSec: number;
  public isPlaying: boolean;
  public viewersPresent: number;
  public metadata?: TitleRecapMetadata;

  public soloCheckpoint: SoloPauseCheckpoint | null = null;
  public sharedCheckpoint: SharedDepartureCheckpoint | null = null;
  public recapOffer: RecapOfferState | null = null;
  public isShowingRecap: boolean = false;
  public recapResumePositionSec: number | null = null;

  public pendingEmptyRoomPause: {
    scheduledForMs: number;
    positionSec: number;
  } | null = null;

  public lastVoteMs: number = 0;

  // --- Phase 2: Attention-Aware Viewing state ---
  public attentionPaused: boolean = false;
  public attentionOverride: boolean = false;
  public attentionInattentiveSinceMs: number | null = null;
  public attentionDistractionCheckpoint: AttentionDistractionCheckpoint | null = null;
  public attentionReplayOffer: AttentionReplayOfferState | null = null;

  constructor(
    titleId: string,
    durationSec: number = 10,
    config: PlaybackIntelligenceConfig = DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG,
    metadata?: TitleRecapMetadata,
  ) {
    this.titleId = titleId;
    this.durationSec = durationSec;
    this.currentPositionSec = 0;
    this.isPlaying = true;
    this.viewersPresent = 1;
    this.config = config;
    this.metadata = metadata;
  }

  /**
   * Keep engine in sync with active player metrics.
   * If the title changes, stale checkpoints and offers are cleanly cleared.
   */
  public updatePlaybackState({
    titleId,
    durationSec,
    currentPositionSec,
    isPlaying,
    metadata,
  }: {
    titleId: string;
    durationSec?: number;
    currentPositionSec: number;
    isPlaying: boolean;
    metadata?: TitleRecapMetadata;
  }): void {
    if (titleId !== this.titleId) {
      this.titleId = titleId;
      this.soloCheckpoint = null;
      this.sharedCheckpoint = null;
      this.recapOffer = null;
      this.isShowingRecap = false;
      this.recapResumePositionSec = null;
      this.pendingEmptyRoomPause = null;
      this.attentionPaused = false;
      this.attentionOverride = false;
      this.attentionInattentiveSinceMs = null;
      this.attentionDistractionCheckpoint = null;
      this.attentionReplayOffer = null;
    }
    if (typeof durationSec === 'number' && durationSec > 0) {
      this.durationSec = durationSec;
    }
    this.currentPositionSec = Math.max(0, currentPositionSec);
    this.isPlaying = isPlaying;
    if (metadata) {
      this.metadata = metadata;
    }
  }

  /**
   * Handle room presence count transition.
   * Emits discrete actions for solo and shared viewing scenarios.
   */
  public onPersonCountChange(
    newCount: number,
    previousCount?: number,
    nowMs: number = Date.now(),
  ): PlaybackPolicyAction {
    const prev = typeof previousCount === 'number' ? previousCount : this.viewersPresent;
    this.viewersPresent = newCount;

    // --- Scenario A: Solo viewing (1 -> 0) ---
    if (newCount === 0 && prev === 1) {
      // Schedule empty-room pause after configurable grace period
      this.pendingEmptyRoomPause = {
        scheduledForMs: nowMs + this.config.emptyRoomGracePeriodMs,
        positionSec: this.currentPositionSec,
      };
      return { type: 'NONE' };
    }

    // --- Scenario A: Solo return (0 -> >= 1) ---
    if (prev === 0 && newCount >= 1) {
      // If grace period was still pending (transient occlusion), cancel it
      if (this.pendingEmptyRoomPause) {
        this.pendingEmptyRoomPause = null;
      }

      // If playback was paused by solo empty-room policy, resume from exact position
      if (this.soloCheckpoint) {
        const resumePos = this.soloCheckpoint.playbackPositionSec;
        this.soloCheckpoint = null;

        // Check if a prior shared-viewing departure is also eligible for recap
        if (this.sharedCheckpoint) {
          const evalRes = isRecapWarranted({
            checkpoint: this.sharedCheckpoint,
            currentTitleId: this.titleId,
            currentPositionSec: resumePos,
            durationSec: this.durationSec,
            nowMs,
            config: this.config,
          });
          if (evalRes.warranted) {
            this.recapOffer = {
              titleId: this.titleId,
              departurePositionSec: this.sharedCheckpoint.departurePositionSec,
              returnPositionSec: resumePos,
              durationSec: this.durationSec,
              missedProgress: evalRes.missedProgress,
              missedSec: evalRes.missedSec,
              eligibleViewers: newCount,
              requiredVotes: calculateRequiredVotes(newCount),
              currentVotes: 0,
              offeredAtMs: nowMs,
              expiresAtMs: nowMs + this.config.recapOfferTimeoutSec * 1000,
              metadata: this.metadata,
            };
          }
        }

        // Resume playback immediately: no recap modal for purely solo viewers
        return { type: 'RESUME_SOLO', positionSec: resumePos };
      }
      return { type: 'NONE' };
    }

    // --- Scenario B: Shared viewing departure (N -> N-1 where N-1 > 0) ---
    if (newCount < prev && newCount > 0) {
      this.sharedCheckpoint = {
        titleId: this.titleId,
        departurePositionSec: this.currentPositionSec,
        durationSec: this.durationSec,
        viewerCount: newCount,
        departureWallMs: nowMs,
      };
      return {
        type: 'RECORD_SHARED_DEPARTURE',
        checkpoint: this.sharedCheckpoint,
      };
    }

    // --- Scenario B: Shared viewing return (room count increases while >0) ---
    if (newCount > prev && prev > 0 && this.sharedCheckpoint) {
      const evalRes = isRecapWarranted({
        checkpoint: this.sharedCheckpoint,
        currentTitleId: this.titleId,
        currentPositionSec: this.currentPositionSec,
        durationSec: this.durationSec,
        nowMs,
        config: this.config,
      });

      if (evalRes.warranted) {
        this.recapOffer = {
          titleId: this.titleId,
          departurePositionSec: this.sharedCheckpoint.departurePositionSec,
          returnPositionSec: this.currentPositionSec,
          durationSec: this.durationSec,
          missedProgress: evalRes.missedProgress,
          missedSec: evalRes.missedSec,
          eligibleViewers: newCount,
          requiredVotes: calculateRequiredVotes(newCount),
          currentVotes: 0,
          offeredAtMs: nowMs,
          expiresAtMs: nowMs + this.config.recapOfferTimeoutSec * 1000,
          metadata: this.metadata,
        };
        return { type: 'OFFER_RECAP', offer: this.recapOffer };
      }
    }

    return { type: 'NONE' };
  }

  /**
   * Polls the grace period timer. When the room has stayed empty past the grace period,
   * fires the PAUSE_SOLO action.
   */
  public checkGracePeriod(nowMs: number): PlaybackPolicyAction {
    if (
      this.pendingEmptyRoomPause &&
      nowMs >= this.pendingEmptyRoomPause.scheduledForMs
    ) {
      if (this.viewersPresent === 0) {
        this.soloCheckpoint = {
          titleId: this.titleId,
          playbackPositionSec: this.pendingEmptyRoomPause.positionSec,
          pausedAtMs: nowMs,
        };
        this.pendingEmptyRoomPause = null;
        return {
          type: 'PAUSE_SOLO',
          reason: 'empty_room',
          checkpoint: this.soloCheckpoint,
        };
      } else {
        this.pendingEmptyRoomPause = null;
      }
    }

    // Auto-dismiss recap offer if its display timeout expired
    if (this.recapOffer && nowMs >= this.recapOffer.expiresAtMs) {
      this.recapOffer = null;
      return { type: 'DISMISS_RECAP', reason: 'timeout' };
    }

    // Check sustained inattention timeout
    if (
      !this.attentionPaused &&
      !this.attentionOverride &&
      this.attentionInattentiveSinceMs !== null
    ) {
      const elapsed = nowMs - this.attentionInattentiveSinceMs;
      if (elapsed >= this.config.attentionSustainedPeriodSec * 1000) {
        this.attentionPaused = true;
        this.isPlaying = false;
        const startPos = Math.max(
          0,
          this.currentPositionSec - this.config.attentionSustainedPeriodSec,
        );
        this.attentionDistractionCheckpoint = {
          titleId: this.titleId,
          startPositionSec: startPos,
          pausedPositionSec: this.currentPositionSec,
          pausedAtMs: nowMs,
        };
        return {
          type: 'PAUSE_ATTENTION',
          reason: 'viewers_distracted',
          checkpoint: this.attentionDistractionCheckpoint,
        };
      }
    }

    // Auto-dismiss attention replay offer if expired
    if (this.attentionReplayOffer && nowMs >= this.attentionReplayOffer.expiresAtMs) {
      this.attentionReplayOffer = null;
    }

    return { type: 'NONE' };
  }

  /**
   * Evaluates viewer orientation & attention.
   * If > 70% of viewers are turned away for a sustained period, triggers PAUSE_ATTENTION.
   * When attention returns, automatically resumes and offers replay/recap if meaningful content was missed.
   */
  public onAttentionChange({
    attentiveCount,
    distractedCount,
    totalViewers,
    nowMs = Date.now(),
  }: {
    attentiveCount: number;
    distractedCount: number;
    totalViewers?: number;
    nowMs?: number;
  }): PlaybackPolicyAction {
    const total =
      typeof totalViewers === 'number' && totalViewers > 0
        ? totalViewers
        : attentiveCount + distractedCount;

    if (total === 0) {
      this.attentionInattentiveSinceMs = null;
      return { type: 'NONE' };
    }

    const inattentiveCount = distractedCount;
    const ratio = inattentiveCount / total;
    const isDistracted = ratio > this.config.attentionInattentiveThreshold;

    if (isDistracted) {
      if (this.attentionOverride) {
        return { type: 'NONE' };
      }

      if (!this.attentionPaused) {
        if (this.attentionInattentiveSinceMs === null) {
          this.attentionInattentiveSinceMs = nowMs;
        }
        const elapsed = nowMs - this.attentionInattentiveSinceMs;
        if (elapsed >= this.config.attentionSustainedPeriodSec * 1000) {
          this.attentionPaused = true;
          this.isPlaying = false;
          const startPos = Math.max(
            0,
            this.currentPositionSec - this.config.attentionSustainedPeriodSec,
          );
          this.attentionDistractionCheckpoint = {
            titleId: this.titleId,
            startPositionSec: startPos,
            pausedPositionSec: this.currentPositionSec,
            pausedAtMs: nowMs,
          };
          return {
            type: 'PAUSE_ATTENTION',
            reason: 'viewers_distracted',
            checkpoint: this.attentionDistractionCheckpoint,
          };
        }
      }
      return { type: 'NONE' };
    }

    // Viewers are facing the TV again
    this.attentionInattentiveSinceMs = null;
    this.attentionOverride = false;

    if (this.attentionPaused) {
      this.attentionPaused = false;
      this.isPlaying = true;
      const checkpoint = this.attentionDistractionCheckpoint;
      this.attentionDistractionCheckpoint = null;

      const missedSec = checkpoint
        ? Math.max(0, checkpoint.pausedPositionSec - checkpoint.startPositionSec)
        : 0;
      const replayPos = checkpoint ? checkpoint.startPositionSec : this.currentPositionSec;
      const offerReplay = missedSec >= this.config.minAttentionMissedSec;

      if (offerReplay) {
        this.attentionReplayOffer = {
          titleId: this.titleId,
          missedSec,
          replayPositionSec: replayPos,
          offeredAtMs: nowMs,
          expiresAtMs: nowMs + 12000,
          metadata: this.metadata,
        };
      }

      return {
        type: 'RESUME_ATTENTION',
        autoResume: true,
        offerReplay,
        missedSec,
        replayPositionSec: replayPos,
      };
    }

    return { type: 'NONE' };
  }

  /**
   * Viewer override: If any viewer gives a thumbs-up (or selects "Keep Playing"),
   * allows playback to continue even if the majority remains turned away.
   */
  public overrideAttention(nowMs: number = Date.now()): PlaybackPolicyAction {
    this.attentionOverride = true;
    this.attentionInattentiveSinceMs = null;
    if (this.attentionPaused) {
      this.attentionPaused = false;
      this.isPlaying = true;
      this.attentionDistractionCheckpoint = null;
      return { type: 'OVERRIDE_ATTENTION', resume: true };
    }
    return { type: 'OVERRIDE_ATTENTION', resume: false };
  }

  /**
   * Dismiss the optional attention replay banner.
   */
  public dismissAttentionOffer(): PlaybackPolicyAction {
    this.attentionReplayOffer = null;
    return { type: 'NONE' };
  }

  /**
   * Accepts the replay offer, returning the replay seek position.
   */
  public replayAttentionMissed(): number {
    const replayPos =
      this.attentionReplayOffer?.replayPositionSec ?? this.currentPositionSec;
    this.attentionReplayOffer = null;
    return replayPos;
  }

  /**
   * Handle voting input for the active recap offer.
   * Supports manual remote approval (immediate consensus) and thumbs-up gestures with cooldown.
   */
  public vote(
    source: 'remote' | 'thumbs_up',
    nowMs: number,
  ): PlaybackPolicyAction {
    if (!this.recapOffer) {
      return { type: 'NONE' };
    }

    if (nowMs >= this.recapOffer.expiresAtMs) {
      this.recapOffer = null;
      return { type: 'DISMISS_RECAP', reason: 'timeout' };
    }

    if (source === 'thumbs_up') {
      if (nowMs - this.lastVoteMs < this.config.voteCooldownMs) {
        // Cooldown in effect; avoid repeated voting from one held hand
        return { type: 'NONE' };
      }
      this.lastVoteMs = nowMs;
      this.recapOffer.currentVotes += 1;
    } else if (source === 'remote') {
      // Direct remote press satisfies consensus
      this.recapOffer.currentVotes = this.recapOffer.requiredVotes;
    }

    if (this.recapOffer.currentVotes >= this.recapOffer.requiredVotes) {
      this.recapResumePositionSec = this.currentPositionSec;
      this.isShowingRecap = true;
      const meta = this.recapOffer.metadata || this.metadata;
      this.recapOffer = null;
      this.sharedCheckpoint = null;
      return {
        type: 'START_RECAP',
        resumePositionSec: this.recapResumePositionSec,
        metadata: meta,
      };
    }

    return { type: 'NONE' };
  }

  /**
   * Dismiss the recap offer without watching. The movie keeps playing uninterrupted.
   */
  public dismissRecapOffer(): PlaybackPolicyAction {
    this.recapOffer = null;
    this.sharedCheckpoint = null;
    return { type: 'DISMISS_RECAP', reason: 'manual' };
  }

  /**
   * Finish the recap experience and restore normal playback.
   */
  public finishRecap(): { resumePositionSec: number } {
    this.isShowingRecap = false;
    const resumeSec = this.recapResumePositionSec ?? this.currentPositionSec;
    this.recapResumePositionSec = null;
    return { resumePositionSec: resumeSec };
  }
}
