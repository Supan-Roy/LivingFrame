import {MediaItem, ContentCategory} from '../types/catalog';
import {fallbackMediaItems, fallbackCategories} from '../data/catalogData';

const REMOTE_CATALOG_URL = 'https://giolaq.github.io/scrap-tv-feed/catalog.json';

interface RemoteCatalogItem {
  id: string;
  type: string;
  title: string;
  category: string;
  genres: string[];
  trending?: boolean;
  rating_stars?: number;
  content_rating?: string;
  release_year?: number;
  duration_sec?: number;
  images?: {
    poster_16x9?: string;
  };
  sources?: Array<{
    type: string;
    url: string;
  }>;
  description?: string;
}

interface RemoteCatalogResponse {
  items: RemoteCatalogItem[];
}

export class CatalogService {
  /**
   * Retrieves categories, starting with instant bundled fallback
   * and enhancing with remote catalog data if available.
   */
  public static async getCategories(): Promise<{
    categories: ContentCategory[];
    allItems: MediaItem[];
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(REMOTE_CATALOG_URL, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          categories: fallbackCategories,
          allItems: fallbackMediaItems,
        };
      }

      const data: RemoteCatalogResponse = await response.json();
      if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        return {
          categories: fallbackCategories,
          allItems: fallbackMediaItems,
        };
      }

      // Map remote items safely
      const remoteItems: MediaItem[] = data.items.map((item) => {
        const videoSource = item.sources?.find((s) => s.type === 'mp4') || item.sources?.[0];
        return {
          id: item.id,
          title: item.title,
          category: item.category || 'General',
          genres: item.genres || ['Entertainment'],
          description: item.description || '',
          posterUrl:
            item.images?.poster_16x9 ||
            fallbackMediaItems[0].posterUrl,
          releaseYear: item.release_year || 2026,
          ratingStars: item.rating_stars || 4.5,
          contentRating: item.content_rating || 'TV-G',
          durationSec: item.duration_sec || 3600,
          trending: item.trending ?? false,
          videoUrl: videoSource?.url,
          aiContextHint: 'LivingFrame Room Sensor synced.',
        };
      });

      // Assemble into categories
      const trending = remoteItems.filter((i) => i.trending);
      const sciFi = remoteItems.filter((i) =>
        i.genres.some((g) => g.toLowerCase().includes('sci-fi') || g.toLowerCase().includes('adventure')),
      );
      const rest = remoteItems.filter((i) => !trending.includes(i) && !sciFi.includes(i));

      const dynamicCategories: ContentCategory[] = [
        {
          id: 'trending',
          title: 'Featured & Trending on LivingFrame',
          subtitle: 'Curated for room-responsive viewing',
          items: trending.length > 0 ? trending : fallbackCategories[0].items,
        },
        {
          id: 'scifi',
          title: 'Living Room Sci-Fi & Speculative Cinema',
          subtitle: 'Immersive stories built for cinematic screens',
          items: sciFi.length > 0 ? sciFi : fallbackCategories[1].items,
        },
        {
          id: 'feline',
          title: 'Shared Living Room Favorites',
          subtitle: 'Delightful co-watching for the whole family',
          items: rest.length > 0 ? rest.slice(0, 8) : fallbackCategories[2].items,
        },
      ];

      return {
        categories: dynamicCategories,
        allItems: remoteItems.length > 0 ? remoteItems : fallbackMediaItems,
      };
    } catch (err) {
      // Graceful fallback to verified bundled data
      return {
        categories: fallbackCategories,
        allItems: fallbackMediaItems,
      };
    }
  }
}
