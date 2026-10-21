import type {TitleRecapMetadata} from './catalog';

/**
 * Configuration thresholds for room-aware playback intelligence.
 * All thresholds are centralized here and documented with clear rationale.
 */
export interface PlaybackIntelligenceConfig {
  /**
   * Minimum fraction of total video duration missed to warrant a recap offer.
   * Provisional value: 0.05 (5%).
   * Rationale: Departures missing <5% are brief minor pauses (e.g. 0.5s in a 10s demo,
   * or 30s in a 10-minute clip) that do not miss substantial narrative progression.
   */
  minMissedProgress: number;

  /**
   * Minimum playback progress into the video before departures trigger recap tracking.
   * Provisional value: 0.10 (10%).
   * Rationale: Prevents recap triggers when someone walks in/out during opening logos
   * or title sequences before meaningful story content has begun.
   */
  minDepartureProgress: number;

  /**
   * Maximum wall-clock absence time in seconds before a departure checkpoint expires.
   * Provisional value: 1800 (30 minutes).
   * Rationale: Wall-clock session continuity differs from video duration; day-old or
   * hours-old departure checkpoints must not trigger unexpected recaps in fresh sessions.
   */
  maxSessionAbsenceSec: number;

  /**
   * Grace period in milliseconds before pausing when the room drops to 0 viewers.
   * Provisional value: 2500 (2.5 seconds).
   * Rationale: Prevents false pauses caused by transient computer vision occlusion
   * (e.g. viewer bending down to pick up a drink, turning away, or walking behind furniture).
   */
  emptyRoomGracePeriodMs: number;

  /**
   * Duration in seconds that the non-blocking recap offer banner remains visible.
   * Provisional value: 12 (12 seconds).
   * Rationale: Ample time for living room viewers to decide and vote, without lingering
   * indefinitely over ongoing playback.
   */
  recapOfferTimeoutSec: number;

  /**
   * Minimum cooldown in milliseconds between counting thumbs-up gesture votes.
   * Provisional value: 2000 (2 seconds).
   * Rationale: Prevents a single viewer holding their hand in a thumbs-up pose
   * from rapidly triggering repeated votes across successive frames.
   */
  voteCooldownMs: number;

  /**
   * Fraction of detected viewers turned away to trigger the inattention state.
   * Rule: strictly greater than 70% (e.g. 1/1 = 100%, 2/2 = 100%, 3/4 = 75%).
   */
  attentionInattentiveThreshold: number;

  /**
   * Sustained duration in seconds before inattention pauses playback.
   * Provisional value: 5.0 (5 seconds).
   * Rationale: Prevents pausing on brief natural glances away (e.g. checking a phone or drinking water).
   */
  attentionSustainedPeriodSec: number;

  /**
   * Minimum playback seconds elapsed during inattention to warrant a replay/recap offer upon return.
   * Provisional value: 4.0 (4 seconds).
   */
  minAttentionMissedSec: number;
}

export const DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG: PlaybackIntelligenceConfig = {
  minMissedProgress: 0.05,
  minDepartureProgress: 0.10,
  maxSessionAbsenceSec: 1800,
  emptyRoomGracePeriodMs: 2500,
  recapOfferTimeoutSec: 12,
  voteCooldownMs: 2000,
  attentionInattentiveThreshold: 0.70,
  attentionSustainedPeriodSec: 5.0,
  minAttentionMissedSec: 4.0,
};

/**
 * Saved state when a solo viewer leaves the room.
 */
export interface SoloPauseCheckpoint {
  titleId: string;
  playbackPositionSec: number;
  pausedAtMs: number;
}

/**
 * Saved state when viewers are turned away from the TV for a sustained period.
 */
export interface AttentionDistractionCheckpoint {
  titleId: string;
  startPositionSec: number;
  pausedPositionSec: number;
  pausedAtMs: number;
}

/**
 * State for optional replay / recap offer after viewers return attention to the TV.
 */
export interface AttentionReplayOfferState {
  titleId: string;
  missedSec: number;
  replayPositionSec: number;
  offeredAtMs: number;
  expiresAtMs: number;
  metadata?: TitleRecapMetadata;
}

/**
 * Saved state when one or more viewers leave during shared viewing (N -> N-1 where N-1 > 0).
 */
export interface SharedDepartureCheckpoint {
  titleId: string;
  departurePositionSec: number;
  durationSec: number;
  viewerCount: number;
  departureWallMs: number;
}

/**
 * Active non-blocking recap offer state.
 */
export interface RecapOfferState {
  titleId: string;
  departurePositionSec: number;
  returnPositionSec: number;
  durationSec: number;
  missedProgress: number;
  missedSec: number;
  eligibleViewers: number;
  requiredVotes: number;
  currentVotes: number;
  offeredAtMs: number;
  expiresAtMs: number;
  metadata?: TitleRecapMetadata;
}

/**
 * Result of evaluating whether a recap is warranted upon room occupancy increase.
 */
export interface RecapEligibilityResult {
  warranted: boolean;
  missedProgress: number;
  missedSec: number;
  reason: string;
}

/**
 * Discrete actions emitted by the pure room playback policy engine.
 */
export type PlaybackPolicyAction =
  | { type: 'NONE' }
  | { type: 'PAUSE_SOLO'; reason: 'empty_room'; checkpoint: SoloPauseCheckpoint }
  | { type: 'RESUME_SOLO'; positionSec: number }
  | { type: 'RECORD_SHARED_DEPARTURE'; checkpoint: SharedDepartureCheckpoint }
  | { type: 'OFFER_RECAP'; offer: RecapOfferState }
  | { type: 'DISMISS_RECAP'; reason: 'manual' | 'timeout' }
  | { type: 'START_RECAP'; resumePositionSec: number; metadata?: TitleRecapMetadata }
  | { type: 'PAUSE_ATTENTION'; reason: 'viewers_distracted'; checkpoint: AttentionDistractionCheckpoint }
  | { type: 'RESUME_ATTENTION'; autoResume: boolean; offerReplay: boolean; missedSec: number; replayPositionSec: number }
  | { type: 'OVERRIDE_ATTENTION'; resume: boolean };
