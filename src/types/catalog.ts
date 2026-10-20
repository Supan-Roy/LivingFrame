export type SceneSafetyCategory =
  | 'violence'
  | 'adult_content'
  | 'language'
  | 'other';

/**
 * An explicitly authored, per-asset safety segment.
 *
 * This is hand-written metadata attached to a specific demo asset — it is NOT the
 * result of analysing video content, and LivingFrame does not claim to detect scenes
 * in arbitrary titles. Times are in seconds from the start of the asset.
 */
export interface SceneSafetySegment {
  startSec: number;
  endSec: number;
  category: SceneSafetyCategory;
  /** What to do when the playhead is inside the segment with the policy active. */
  action: 'pause' | 'skip';
  /** Timestamp considered safe to continue from (used by 'skip'). */
  resumeSec: number;
  note?: string;
}

export interface TitleRecapMetadata {
  /** Deterministic authored summary of key narrative moments up to the demo section. */
  summary: string;
  /** Key narrative milestones or bullet highlights. */
  keyPlotPoints?: string[];
  /** Optional dedicated recap clip URL if footage exists. */
  recapVideoUrl?: string;
  /** Coverage interval start in seconds. */
  coverageStartSec?: number;
  /** Coverage interval end in seconds. */
  coverageEndSec?: number;
}

export interface MediaItem {
  id: string;
  title: string;
  category: string;
  genres: string[];
  description: string;
  posterUrl: string;
  releaseYear: number;
  ratingStars: number;
  contentRating: string;
  durationSec: number;
  trending?: boolean;
  videoUrl?: string;
  aiContextHint?: string;
  /** Authored safety metadata for this asset; empty array means family-safe. */
  sceneSafety?: SceneSafetySegment[];
  /** Authored narrative recap metadata for room-aware returning viewer intelligence. */
  recap?: TitleRecapMetadata;
}

export interface ContentCategory {
  id: string;
  title: string;
  subtitle?: string;
  items: MediaItem[];
}
