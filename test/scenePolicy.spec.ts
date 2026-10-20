import {findBlockingSegment, isPolicyIdle} from '../src/room/scenePolicy';
import {fallbackMediaItems} from '../src/data/catalogData';
import type {MediaItem, SceneSafetySegment} from '../src/types/catalog';

const adultSegment: SceneSafetySegment = {
  startSec: 0,
  endSec: 10,
  category: 'adult_content',
  action: 'pause',
  resumeSec: 10,
};

const base = {
  familyModeEnabled: true,
  armed: true,
  override: false,
  segments: [adultSegment],
  currentTimeSec: 5,
};

describe('findBlockingSegment', () => {
  it('blocks inside a tagged segment when Family Mode is armed', () => {
    expect(findBlockingSegment(base)).toBe(adultSegment);
  });

  it('does nothing when Family Mode is off', () => {
    expect(findBlockingSegment({...base, familyModeEnabled: false})).toBeNull();
  });

  it('does nothing until the room arms the policy', () => {
    expect(findBlockingSegment({...base, armed: false})).toBeNull();
  });

  it('respects a viewer override', () => {
    expect(findBlockingSegment({...base, override: true})).toBeNull();
  });

  it('treats the segment start as inclusive and the end as exclusive', () => {
    expect(findBlockingSegment({...base, currentTimeSec: 0})).toBe(adultSegment);
    expect(findBlockingSegment({...base, currentTimeSec: 9.99})).toBe(adultSegment);
    expect(findBlockingSegment({...base, currentTimeSec: 10})).toBeNull();
  });

  it('ignores assets with no tagged segments (family-safe)', () => {
    expect(findBlockingSegment({...base, segments: []})).toBeNull();
  });

  it('only blocks the segment the playhead is actually inside', () => {
    const later: SceneSafetySegment = {
      startSec: 20,
      endSec: 30,
      category: 'violence',
      action: 'skip',
      resumeSec: 30,
    };
    const segments = [adultSegment, later];
    expect(findBlockingSegment({...base, segments, currentTimeSec: 25})).toBe(later);
    expect(findBlockingSegment({...base, segments, currentTimeSec: 15})).toBeNull();
  });
});

describe('catalog scene-safety metadata', () => {
  const byId = (id: string): MediaItem => {
    const item = fallbackMediaItems.find(candidate => candidate.id === id);
    if (!item) {
      throw new Error(`missing catalog item ${id}`);
    }
    return item;
  };

  it('tags Behind The Screams as adult content for the whole clip', () => {
    const item = byId('behind-the-screams');
    expect(item.sceneSafety).toHaveLength(1);
    expect(item.sceneSafety?.[0]).toMatchObject({
      startSec: 0,
      endSec: 10,
      category: 'adult_content',
      action: 'pause',
    });
  });

  it('marks the cartoon titles as family-safe', () => {
    expect(byId('cereal-streamz').sceneSafety).toEqual([]);
    expect(byId('feline-assistant').sceneSafety).toEqual([]);
  });

  it('blocks Behind The Screams but not the cartoons under the same policy', () => {
    const policy = {
      familyModeEnabled: true,
      armed: true,
      override: false,
      currentTimeSec: 5,
    };
    expect(
      findBlockingSegment({
        ...policy,
        segments: byId('behind-the-screams').sceneSafety ?? [],
      }),
    ).not.toBeNull();
    expect(
      findBlockingSegment({
        ...policy,
        segments: byId('cereal-streamz').sceneSafety ?? [],
      }),
    ).toBeNull();
  });
});

describe('isPolicyIdle', () => {
  it('is idle only when Family Mode is on but the room has not armed it', () => {
    expect(isPolicyIdle(true, false)).toBe(true);
    expect(isPolicyIdle(true, true)).toBe(false);
    expect(isPolicyIdle(false, false)).toBe(false);
  });
});
