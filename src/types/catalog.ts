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
}

export interface ContentCategory {
  id: string;
  title: string;
  subtitle?: string;
  items: MediaItem[];
}
