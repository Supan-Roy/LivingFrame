import type {SceneSafetySegment} from '../types/catalog';

export interface ScenePolicyInput {
  familyModeEnabled: boolean;
  /** True once a person entered while Family Mode was on (room-triggered policy). */
  armed: boolean;
  /** Viewer chose "resume anyway" for the current segment. */
  override: boolean;
  segments: SceneSafetySegment[];
  currentTimeSec: number;
}

/**
 * Returns the authored safety segment that must block playback right now, or null.
 *
 * Policy: the playhead is inside a tagged segment AND Family Mode is on AND the room
 * policy is armed AND the viewer has not overridden it.
 *
 * Segment bounds are [startSec, endSec) — the start is inclusive, the end exclusive, so
 * a segment ending at 10 does not block at exactly t=10.
 */
export const findBlockingSegment = ({
  familyModeEnabled,
  armed,
  override,
  segments,
  currentTimeSec,
}: ScenePolicyInput): SceneSafetySegment | null => {
  if (!familyModeEnabled || !armed || override) {
    return null;
  }
  return (
    segments.find(
      segment =>
        currentTimeSec >= segment.startSec && currentTimeSec < segment.endSec,
    ) ?? null
  );
};

/** True when Family Mode is on but the policy has not been armed by the room yet. */
export const isPolicyIdle = (familyModeEnabled: boolean, armed: boolean): boolean =>
  familyModeEnabled && !armed;
