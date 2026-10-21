import {
  calculateProgress,
  calculateMissedProgress,
  calculateRequiredVotes,
  isRecapWarranted,
  RoomPlaybackEngine,
  DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG,
} from '../src/room/playbackIntelligence';
import type {SharedDepartureCheckpoint} from '../src/types/playbackIntelligence';
import type {TitleRecapMetadata} from '../src/types/catalog';

describe('Room-Aware Playback Intelligence - Pure Policy & Calculations', () => {
  const sampleMeta: TitleRecapMetadata = {
    summary: 'A thrilling drama about living rooms and television screens.',
    keyPlotPoints: ['Act 1 starts', 'Plot twist at the dunes'],
    coverageStartSec: 0,
    coverageEndSec: 5,
  };

  describe('Proportional Progress Math', () => {
    it('calculates progress accurately and clamps to [0, 1]', () => {
      expect(calculateProgress(0, 10)).toBe(0);
      expect(calculateProgress(5, 10)).toBe(0.5);
      expect(calculateProgress(10, 10)).toBe(1);
      expect(calculateProgress(15, 10)).toBe(1);
    });

    it('safely handles zero, negative, or NaN durations without division by zero', () => {
      expect(calculateProgress(5, 0)).toBe(0);
      expect(calculateProgress(5, -10)).toBe(0);
      expect(calculateProgress(5, NaN)).toBe(0);
      expect(calculateProgress(NaN, 10)).toBe(0);
      expect(calculateProgress(-5, 10)).toBe(0);
    });

    it('calculates missed progress proportionally across 10s clips, 2m clips, and 150m movies', () => {
      // 10s clip: 0.5s is 5%
      expect(calculateMissedProgress(2.0, 2.5, 10)).toBeCloseTo(0.05, 5);

      // 120s clip: 6s is 5%
      expect(calculateMissedProgress(30, 36, 120)).toBeCloseTo(0.05, 5);

      // 9000s (150m) movie: 450s (7.5m) is 5%
      expect(calculateMissedProgress(1000, 1450, 9000)).toBeCloseTo(0.05, 5);

      // Current position behind departure position returns 0
      expect(calculateMissedProgress(5, 4, 10)).toBe(0);
    });
  });

  describe('Voting Consensus Math', () => {
    it('computes correct majority threshold: requiredVotes = Math.ceil(eligibleViewerCount / 2)', () => {
      expect(calculateRequiredVotes(1)).toBe(1);
      expect(calculateRequiredVotes(2)).toBe(1);
      expect(calculateRequiredVotes(3)).toBe(2);
      expect(calculateRequiredVotes(4)).toBe(2);
      expect(calculateRequiredVotes(5)).toBe(3);
      expect(calculateRequiredVotes(6)).toBe(3);
    });
  });

  describe('isRecapWarranted boundary checks', () => {
    const baseCheckpoint: SharedDepartureCheckpoint = {
      titleId: 'demo-title',
      departurePositionSec: 2.0, // 20% into 10s clip (>= 10% min departure)
      durationSec: 10.0,
      viewerCount: 1,
      departureWallMs: 100000,
    };

    it('rejects when no checkpoint exists', () => {
      const res = isRecapWarranted({
        checkpoint: null,
        currentTitleId: 'demo-title',
        currentPositionSec: 3.0,
        durationSec: 10.0,
        nowMs: 102000,
      });
      expect(res.warranted).toBe(false);
      expect(res.reason).toBe('no_departure_checkpoint');
    });

    it('rejects when title has changed', () => {
      const res = isRecapWarranted({
        checkpoint: baseCheckpoint,
        currentTitleId: 'different-title',
        currentPositionSec: 3.0,
        durationSec: 10.0,
        nowMs: 102000,
      });
      expect(res.warranted).toBe(false);
      expect(res.reason).toBe('title_mismatch');
    });

    it('rejects when wall-clock absence exceeds maxSessionAbsenceSec (30 min)', () => {
      const res = isRecapWarranted({
        checkpoint: baseCheckpoint,
        currentTitleId: 'demo-title',
        currentPositionSec: 3.0,
        durationSec: 10.0,
        nowMs: 100000 + (1801 * 1000), // > 1800s later
      });
      expect(res.warranted).toBe(false);
      expect(res.reason).toBe('session_timeout');
    });

    it('rejects when departure happened before minDepartureProgress (10%)', () => {
      const earlyCheckpoint: SharedDepartureCheckpoint = {
        ...baseCheckpoint,
        departurePositionSec: 0.5, // 5% into 10s clip (< 10%)
      };
      const res = isRecapWarranted({
        checkpoint: earlyCheckpoint,
        currentTitleId: 'demo-title',
        currentPositionSec: 2.0,
        durationSec: 10.0,
        nowMs: 102000,
      });
      expect(res.warranted).toBe(false);
      expect(res.reason).toBe('insufficient_departure_progress');
    });

    it('rejects when missed progress is below minMissedProgress (5%)', () => {
      // Depart at 2.0s, return at 2.3s -> missed 0.3s (3% < 5%)
      const res = isRecapWarranted({
        checkpoint: baseCheckpoint,
        currentTitleId: 'demo-title',
        currentPositionSec: 2.3,
        durationSec: 10.0,
        nowMs: 102000,
      });
      expect(res.warranted).toBe(false);
      expect(res.reason).toBe('insufficient_missed_progress');
      expect(res.missedProgress).toBeCloseTo(0.03, 3);
    });

    it('approves when missed progress meets or exceeds minMissedProgress (>= 5%)', () => {
      // Depart at 2.0s, return at 2.6s -> missed 0.6s (6% >= 5%)
      const res = isRecapWarranted({
        checkpoint: baseCheckpoint,
        currentTitleId: 'demo-title',
        currentPositionSec: 2.6,
        durationSec: 10.0,
        nowMs: 102000,
      });
      expect(res.warranted).toBe(true);
      expect(res.reason).toBe('eligible');
      expect(res.missedProgress).toBeCloseTo(0.06, 3);
      expect(res.missedSec).toBeCloseTo(0.6, 3);
    });

    it('handles zero or invalid duration safely without errors', () => {
      const res = isRecapWarranted({
        checkpoint: baseCheckpoint,
        currentTitleId: 'demo-title',
        currentPositionSec: 3.0,
        durationSec: 0,
        nowMs: 102000,
      });
      expect(res.warranted).toBe(false);
      expect(res.reason).toBe('invalid_duration');
    });
  });

  describe('RoomPlaybackEngine State Machine', () => {
    let engine: RoomPlaybackEngine;

    beforeEach(() => {
      engine = new RoomPlaybackEngine('test-movie', 10.0, DEFAULT_PLAYBACK_INTELLIGENCE_CONFIG, sampleMeta);
    });

    describe('Scenario A: Solo Viewing', () => {
      it('solo viewer leaves: schedules pause after grace period; cancels if viewer returns quickly', () => {
        engine.viewersPresent = 1;
        engine.currentPositionSec = 4.2;

        // Transition 1 -> 0
        const action1 = engine.onPersonCountChange(0, 1, 1000);
        expect(action1).toEqual({type: 'NONE'});
        expect(engine.pendingEmptyRoomPause).toBeTruthy();
        expect(engine.pendingEmptyRoomPause?.positionSec).toBe(4.2);

        // Viewer returns before grace period expires (transient occlusion)
        const action2 = engine.onPersonCountChange(1, 0, 1800); // 800ms < 2500ms
        expect(action2).toEqual({type: 'NONE'});
        expect(engine.pendingEmptyRoomPause).toBeNull();
        expect(engine.soloCheckpoint).toBeNull();
      });

      it('solo viewer leaves: pauses playback when room remains empty past grace period', () => {
        engine.viewersPresent = 1;
        engine.currentPositionSec = 4.5;

        engine.onPersonCountChange(0, 1, 1000);

        // Before grace period finishes: still none
        const poll1 = engine.checkGracePeriod(3000); // 2000ms < 2500ms
        expect(poll1).toEqual({type: 'NONE'});

        // After grace period finishes (1000 + 2500 = 3500ms): triggers PAUSE_SOLO
        const poll2 = engine.checkGracePeriod(3600);
        expect(poll2.type).toBe('PAUSE_SOLO');
        if (poll2.type === 'PAUSE_SOLO') {
          expect(poll2.checkpoint.playbackPositionSec).toBe(4.5);
          expect(poll2.checkpoint.titleId).toBe('test-movie');
        }
        expect(engine.soloCheckpoint?.playbackPositionSec).toBe(4.5);
      });

      it('solo viewer returns: resumes playback from exact checkpoint and NEVER produces recap', () => {
        engine.viewersPresent = 0;
        engine.soloCheckpoint = {
          titleId: 'test-movie',
          playbackPositionSec: 4.5,
          pausedAtMs: 3500,
        };

        // Transition 0 -> 1
        const action = engine.onPersonCountChange(1, 0, 5000);
        expect(action).toEqual({
          type: 'RESUME_SOLO',
          positionSec: 4.5,
        });

        // Verify no recap offer was generated
        expect(engine.recapOffer).toBeNull();
        expect(engine.soloCheckpoint).toBeNull();
      });
    });

    describe('Scenario B: Shared Viewing', () => {
      it('viewer leaves shared room (2 -> 1): records checkpoint, does not pause movie', () => {
        engine.viewersPresent = 2;
        engine.currentPositionSec = 2.0; // 20% into movie

        const action = engine.onPersonCountChange(1, 2, 10000);
        expect(action.type).toBe('RECORD_SHARED_DEPARTURE');
        if (action.type === 'RECORD_SHARED_DEPARTURE') {
          expect(action.checkpoint.departurePositionSec).toBe(2.0);
          expect(action.checkpoint.viewerCount).toBe(1);
          expect(action.checkpoint.titleId).toBe('test-movie');
        }

        expect(engine.sharedCheckpoint?.departurePositionSec).toBe(2.0);
        expect(engine.recapOffer).toBeNull();
        // Playback remains uninterrupted
        expect(engine.isPlaying).toBe(true);
      });

      it('viewer returns with negligible missed progress (<5%): no recap offered', () => {
        engine.viewersPresent = 2;
        engine.currentPositionSec = 2.0;
        engine.onPersonCountChange(1, 2, 10000);

        // Movie only progressed to 2.2s (missed 0.2s = 2% < 5%)
        engine.currentPositionSec = 2.2;
        const returnAction = engine.onPersonCountChange(2, 1, 10500);

        expect(returnAction).toEqual({type: 'NONE'});
        expect(engine.recapOffer).toBeNull();
      });

      it('viewer returns with sufficient proportional progress (>=5%): offers non-blocking recap', () => {
        engine.viewersPresent = 2;
        engine.currentPositionSec = 2.0; // 20% (>= 10% min departure)
        engine.onPersonCountChange(1, 2, 10000);

        // Movie progressed to 3.0s (missed 1.0s = 10% >= 5%)
        engine.currentPositionSec = 3.0;
        const returnAction = engine.onPersonCountChange(2, 1, 15000);

        expect(returnAction.type).toBe('OFFER_RECAP');
        if (returnAction.type === 'OFFER_RECAP') {
          expect(returnAction.offer.departurePositionSec).toBe(2.0);
          expect(returnAction.offer.returnPositionSec).toBe(3.0);
          expect(returnAction.offer.missedProgress).toBeCloseTo(0.10, 3);
          expect(returnAction.offer.eligibleViewers).toBe(2);
          expect(returnAction.offer.requiredVotes).toBe(1); // ceil(2/2) = 1
        }
      });

      it('recap offer dismiss: leaves main movie playing and clears offer', () => {
        engine.recapOffer = {
          titleId: 'test-movie',
          departurePositionSec: 2.0,
          returnPositionSec: 3.0,
          durationSec: 10.0,
          missedProgress: 0.10,
          missedSec: 1.0,
          eligibleViewers: 2,
          requiredVotes: 1,
          currentVotes: 0,
          offeredAtMs: 10000,
          expiresAtMs: 22000,
        };

        const action = engine.dismissRecapOffer();
        expect(action).toEqual({type: 'DISMISS_RECAP', reason: 'manual'});
        expect(engine.recapOffer).toBeNull();
        expect(engine.sharedCheckpoint).toBeNull();
      });

      it('recap offer timeout: auto-dismisses after timeout without stopping movie', () => {
        engine.recapOffer = {
          titleId: 'test-movie',
          departurePositionSec: 2.0,
          returnPositionSec: 3.0,
          durationSec: 10.0,
          missedProgress: 0.10,
          missedSec: 1.0,
          eligibleViewers: 2,
          requiredVotes: 1,
          currentVotes: 0,
          offeredAtMs: 10000,
          expiresAtMs: 22000,
        };

        // Before expiry: none
        expect(engine.checkGracePeriod(20000)).toEqual({type: 'NONE'});

        // After expiry (22000ms): dismisses
        const action = engine.checkGracePeriod(22001);
        expect(action).toEqual({type: 'DISMISS_RECAP', reason: 'timeout'});
        expect(engine.recapOffer).toBeNull();
      });
    });

    describe('Voting Consensus & Cooldowns', () => {
      beforeEach(() => {
        engine.recapOffer = {
          titleId: 'test-movie',
          departurePositionSec: 2.0,
          returnPositionSec: 4.0,
          durationSec: 10.0,
          missedProgress: 0.20,
          missedSec: 2.0,
          eligibleViewers: 3,
          requiredVotes: 2, // ceil(3/2) = 2
          currentVotes: 0,
          offeredAtMs: 10000,
          expiresAtMs: 25000,
          metadata: sampleMeta,
        };
        engine.currentPositionSec = 4.0;
      });

      it('manual remote approval immediately reaches threshold and starts recap', () => {
        const action = engine.vote('remote', 12000);
        expect(action.type).toBe('START_RECAP');
        if (action.type === 'START_RECAP') {
          expect(action.resumePositionSec).toBe(4.0);
          expect(action.metadata?.summary).toBe(sampleMeta.summary);
        }
        expect(engine.isShowingRecap).toBe(true);
      });

      it('thumbs-up gesture increments votes up to majority and respects cooldown', () => {
        // Vote 1 at t=12000
        const action1 = engine.vote('thumbs_up', 12000);
        expect(action1).toEqual({type: 'NONE'});
        expect(engine.recapOffer?.currentVotes).toBe(1);

        // Immediate duplicate gesture at t=12500 (within 2000ms cooldown): ignored!
        const actionDup = engine.vote('thumbs_up', 12500);
        expect(actionDup).toEqual({type: 'NONE'});
        expect(engine.recapOffer?.currentVotes).toBe(1);

        // Vote 2 at t=14500 (> 2000ms cooldown): reaches threshold 2/2 -> starts recap!
        const action2 = engine.vote('thumbs_up', 14500);
        expect(action2.type).toBe('START_RECAP');
        if (action2.type === 'START_RECAP') {
          expect(action2.resumePositionSec).toBe(4.0);
        }
        expect(engine.isShowingRecap).toBe(true);
      });

      it('finishing recap restores exact main playback position without rewinding or restarting', () => {
        engine.vote('remote', 12000);
        expect(engine.isShowingRecap).toBe(true);

        const res = engine.finishRecap();
        expect(res.resumePositionSec).toBe(4.0);
        expect(engine.isShowingRecap).toBe(false);
      });
    });

    describe('Scenario C: Room becomes empty during shared viewing', () => {
      it('preserves shared departure checkpoint when remaining viewers subsequently leave', () => {
        engine.viewersPresent = 2;
        engine.currentPositionSec = 2.0;

        // 2 -> 1: viewer 1 leaves
        engine.onPersonCountChange(1, 2, 10000);
        expect(engine.sharedCheckpoint?.departurePositionSec).toBe(2.0);

        // Playback continues to 3.0s
        engine.currentPositionSec = 3.0;

        // 1 -> 0: remaining viewer leaves
        engine.onPersonCountChange(0, 1, 15000);
        expect(engine.sharedCheckpoint?.departurePositionSec).toBe(2.0);

        // Grace period expires: solo pause fires
        const pauseAction = engine.checkGracePeriod(15000 + 2600);
        expect(pauseAction.type).toBe('PAUSE_SOLO');
        expect(engine.sharedCheckpoint).toBeTruthy(); // shared checkpoint preserved!

        // Someone returns (0 -> 1)
        const resumeAction = engine.onPersonCountChange(1, 0, 20000);
        expect(resumeAction.type).toBe('RESUME_SOLO');
        if (resumeAction.type === 'RESUME_SOLO') {
          expect(resumeAction.positionSec).toBe(3.0);
        }

        // And since 2.0s -> 3.0s is 1.0s (10% >= 5%), recap is also offered!
        expect(engine.recapOffer?.departurePositionSec).toBe(2.0);
        expect(engine.recapOffer?.returnPositionSec).toBe(3.0);
      });
    });

    describe('Title changes & Reset safety', () => {
      it('title change completely invalidates checkpoints and active recap offers', () => {
        engine.sharedCheckpoint = {
          titleId: 'test-movie',
          departurePositionSec: 2.0,
          durationSec: 10.0,
          viewerCount: 1,
          departureWallMs: 10000,
        };
        engine.recapOffer = {
          titleId: 'test-movie',
          departurePositionSec: 2.0,
          returnPositionSec: 3.0,
          durationSec: 10.0,
          missedProgress: 0.10,
          missedSec: 1.0,
          eligibleViewers: 2,
          requiredVotes: 1,
          currentVotes: 0,
          offeredAtMs: 10000,
          expiresAtMs: 22000,
        };

        engine.updatePlaybackState({
          titleId: 'new-movie-title',
          currentPositionSec: 0,
          isPlaying: true,
        });

        expect(engine.titleId).toBe('new-movie-title');
        expect(engine.sharedCheckpoint).toBeNull();
        expect(engine.recapOffer).toBeNull();
        expect(engine.soloCheckpoint).toBeNull();
        expect(engine.attentionPaused).toBe(false);
        expect(engine.attentionOverride).toBe(false);
        expect(engine.attentionReplayOffer).toBeNull();
      });
    });

    describe('Phase 2: Attention-Aware Viewing', () => {
      it('calculates inattention ratio and only triggers when strictly > 70% of viewers are turned away', () => {
        // 2 viewers, 1 turned away = 50% <= 70% (no inattention)
        const a1 = engine.onAttentionChange({
          attentiveCount: 1,
          distractedCount: 1,
          totalViewers: 2,
          nowMs: 1000,
        });
        expect(a1.type).toBe('NONE');
        expect(engine.attentionInattentiveSinceMs).toBeNull();

        // 3 viewers, 2 turned away = 66.7% <= 70% (no inattention)
        const a2 = engine.onAttentionChange({
          attentiveCount: 1,
          distractedCount: 2,
          totalViewers: 3,
          nowMs: 1000,
        });
        expect(a2.type).toBe('NONE');
        expect(engine.attentionInattentiveSinceMs).toBeNull();

        // 1 viewer, 1 turned away = 100% > 70% (inattention starts!)
        const a3 = engine.onAttentionChange({
          attentiveCount: 0,
          distractedCount: 1,
          totalViewers: 1,
          nowMs: 1000,
        });
        expect(a3.type).toBe('NONE'); // Not paused immediately; needs sustained period
        expect(engine.attentionInattentiveSinceMs).toBe(1000);
      });

      it('pauses playback with PAUSE_ATTENTION only after sustained inattention period (5.0s)', () => {
        engine.updatePlaybackState({
          titleId: 'test-movie',
          durationSec: 100,
          currentPositionSec: 30,
          isPlaying: true,
        });

        // T=10,000ms: inattention starts (1 viewer turned away)
        engine.onAttentionChange({
          attentiveCount: 0,
          distractedCount: 1,
          totalViewers: 1,
          nowMs: 10000,
        });
        expect(engine.isPlaying).toBe(true);
        expect(engine.attentionPaused).toBe(false);

        // T=13,000ms: 3s elapsed (< 5s sustained threshold)
        const midAction = engine.checkGracePeriod(13000);
        expect(midAction.type).toBe('NONE');
        expect(engine.attentionPaused).toBe(false);

        // Advance playback
        engine.currentPositionSec = 35;

        // T=15,000ms: 5s sustained elapsed -> triggers PAUSE_ATTENTION!
        const pauseAction = engine.checkGracePeriod(15000);
        expect(pauseAction.type).toBe('PAUSE_ATTENTION');
        expect(engine.attentionPaused).toBe(true);
        expect(engine.isPlaying).toBe(false);
        expect(engine.attentionDistractionCheckpoint).toBeTruthy();
        expect(engine.attentionDistractionCheckpoint?.pausedPositionSec).toBe(35);
        expect(engine.attentionDistractionCheckpoint?.startPositionSec).toBe(30);
      });

      it('allows playback to continue if any viewer gives thumbs-up (attention override)', () => {
        engine.updatePlaybackState({
          titleId: 'test-movie',
          durationSec: 100,
          currentPositionSec: 35,
          isPlaying: false,
        });
        engine.attentionPaused = true;
        engine.attentionDistractionCheckpoint = {
          titleId: 'test-movie',
          startPositionSec: 30,
          pausedPositionSec: 35,
          pausedAtMs: 15000,
        };

        // Viewer gives thumbs-up gesture
        const overrideAction = engine.overrideAttention(16000);
        expect(overrideAction.type).toBe('OVERRIDE_ATTENTION');
        if (overrideAction.type === 'OVERRIDE_ATTENTION') {
          expect(overrideAction.resume).toBe(true);
        }
        expect(engine.attentionPaused).toBe(false);
        expect(engine.isPlaying).toBe(true);
        expect(engine.attentionOverride).toBe(true);

        // Further inattention samples do NOT pause while override is active
        const nextAction = engine.onAttentionChange({
          attentiveCount: 0,
          distractedCount: 1,
          totalViewers: 1,
          nowMs: 25000,
        });
        expect(nextAction.type).toBe('NONE');
        expect(engine.attentionPaused).toBe(false);
      });

      it('resumes playback and offers replay/recap when viewers face the TV again after >= 4s missed', () => {
        engine.updatePlaybackState({
          titleId: 'test-movie',
          durationSec: 100,
          currentPositionSec: 35,
          isPlaying: false,
        });
        engine.attentionPaused = true;
        engine.attentionDistractionCheckpoint = {
          titleId: 'test-movie',
          startPositionSec: 30,
          pausedPositionSec: 35,
          pausedAtMs: 15000,
        };

        // Viewer turns back to face the TV at T=20,000ms
        const resumeAction = engine.onAttentionChange({
          attentiveCount: 1,
          distractedCount: 0,
          totalViewers: 1,
          nowMs: 20000,
        });

        expect(resumeAction.type).toBe('RESUME_ATTENTION');
        if (resumeAction.type === 'RESUME_ATTENTION') {
          expect(resumeAction.autoResume).toBe(true);
          expect(resumeAction.offerReplay).toBe(true);
          expect(resumeAction.missedSec).toBe(5);
          expect(resumeAction.replayPositionSec).toBe(30);
        }

        expect(engine.attentionPaused).toBe(false);
        expect(engine.isPlaying).toBe(true);
        expect(engine.attentionReplayOffer).toBeTruthy();
        expect(engine.attentionReplayOffer?.missedSec).toBe(5);

        // Accepting replay rewinds to 30s
        const replayPos = engine.replayAttentionMissed();
        expect(replayPos).toBe(30);
        expect(engine.attentionReplayOffer).toBeNull();
      });

      it('does not offer replay when missed duration is under minAttentionMissedSec (4.0s)', () => {
        engine.updatePlaybackState({
          titleId: 'test-movie',
          durationSec: 100,
          currentPositionSec: 12,
          isPlaying: false,
        });
        engine.attentionPaused = true;
        engine.attentionDistractionCheckpoint = {
          titleId: 'test-movie',
          startPositionSec: 10,
          pausedPositionSec: 12, // 2s missed (< 4s)
          pausedAtMs: 15000,
        };

        const resumeAction = engine.onAttentionChange({
          attentiveCount: 1,
          distractedCount: 0,
          totalViewers: 1,
          nowMs: 16000,
        });

        expect(resumeAction.type).toBe('RESUME_ATTENTION');
        if (resumeAction.type === 'RESUME_ATTENTION') {
          expect(resumeAction.autoResume).toBe(true);
          expect(resumeAction.offerReplay).toBe(false);
        }
        expect(engine.attentionReplayOffer).toBeNull();
      });
    });
  });
});
