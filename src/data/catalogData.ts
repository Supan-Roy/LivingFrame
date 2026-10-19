import {MediaItem, ContentCategory} from '../types/catalog';

export const fallbackMediaItems: MediaItem[] = [
  {
    id: 'behind-the-screams',
    title: 'Behind The Screams',
    category: 'Featured',
    genres: ['Documentary', 'Comedy', 'Cinema'],
    description:
      'An affectionate, hilarious look inside the world of professional horror-movie background screamers, vocal coaches, and the subtle art of running in fear.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/behind-the-screams/poster_1920x1080.jpg',
    releaseYear: 2024,
    ratingStars: 4.8,
    contentRating: 'TV-14',
    durationSec: 5100,
    trending: true,
    videoUrl:
      'http://10.0.2.2:8080/videos/behind-the-screams.mp4',
    aiContextHint:
      'Room Activity: 2 viewers engaged. Recommended for casual evening viewing.',
  },
  {
    id: 'cereal-streamz',
    title: 'Cereal Streamz',
    category: 'Animation',
    genres: ['Animation', 'Nostalgia', 'Family'],
    description:
      'Saturday morning cartoon classics revitalized with fluid 4K color, sugary breakfast commentary, and interactive viewer trivia.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/cereal-streamz/poster_1920x1080.jpg',
    releaseYear: 2024,
    ratingStars: 4.7,
    contentRating: 'TV-G',
    durationSec: 2520,
    trending: true,
    videoUrl:
      'http://10.0.2.2:8080/videos/cereal-streamz.mp4',
    aiContextHint: 'Morning Routine: Upbeat tone suitable for morning coffee & kids.',
  },
  {
    id: 'feline-assistant',
    title: 'Feline Assistant',
    category: 'Comedy',
    genres: ['Comedy', 'Pets', 'Workplace'],
    description:
      'Remote work hits maximum friction when Barnaby the tabby is promoted to Senior Vice President of Keyboard Napping and Zoom Call Interruptions.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/feline-assistant/poster_1920x1080.jpg',
    releaseYear: 2023,
    ratingStars: 4.9,
    contentRating: 'TV-G',
    durationSec: 3300,
    trending: true,
    videoUrl:
      'http://10.0.2.2:8080/videos/feline-assistant.mp4',
    aiContextHint: 'Pet Alert: Low frequency purr track calms room pets.',
  },
  {
    id: 'the-beige-knight',
    title: 'The Beige Knight',
    category: 'Sci-Fi',
    genres: ['Action', 'Fantasy', 'Adventure'],
    description:
      'In a monochrome kingdom on the outer rings of the Cosmos, one solitary defender rises equipped with understated armor and absolute conviction.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/the-beige-knight/poster_1920x1080.jpg',
    releaseYear: 2024,
    ratingStars: 4.6,
    contentRating: 'TV-14',
    durationSec: 6900,
    trending: true,
    videoUrl:
      'http://10.0.2.2:8080/videos/the-beige-knight.mp4',
    aiContextHint: 'Action Mode: Rich surround effects activated.',
  },
  {
    id: 'meditation-in-beige',
    title: 'Meditation In Beige',
    category: 'Ambient',
    genres: ['Wellness', 'Ambient', 'Calm'],
    description:
      'A soothing visual sanctuary of warm earthen tones, gentle kinetic waves, and mindful breathing soundscapes designed to turn your TV into a living canvas.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/meditation-in-beige/poster_1920x1080.jpg',
    releaseYear: 2023,
    ratingStars: 4.5,
    contentRating: 'TV-G',
    durationSec: 7200,
    videoUrl:
      'http://10.0.2.2:8080/videos/meditation-in-beige.mp4',
    aiContextHint:
      'Ambient Sensing: Ideal backdrop when room conversations are active.',
  },
  {
    id: 'the-accounting-cats',
    title: 'The Accounting Cats',
    category: 'Comedy',
    genres: ['Comedy', 'Workplace', 'Satire'],
    description:
      'Spreadsheets, quarterly earnings reports, and audited yarn reserves. Follow the most thorough feline CPAs on Wall Street.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/the-accounting-cats/poster_1920x1080.jpg',
    releaseYear: 2023,
    ratingStars: 4.8,
    contentRating: 'TV-G',
    durationSec: 3840,
    videoUrl:
      'http://10.0.2.2:8080/videos/the-accounting-cats.mp4',
    aiContextHint: 'Lighthearted Comedy: Ideal for multi-generational viewing.',
  },
  {
    id: 'parking-wars',
    title: 'Parking Wars: The Gridlock',
    category: 'Documentary',
    genres: ['Reality', 'Suspense'],
    description:
      'The pulse-pounding chronicle of metropolitan drivers competing for the mythical single open spot on bustling downtown curbs.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/parking-wars/poster_1920x1080.jpg',
    releaseYear: 2022,
    ratingStars: 4.4,
    contentRating: 'TV-PG',
    durationSec: 5400,
    videoUrl:
      'http://10.0.2.2:8080/videos/parking-wars.mp4',
    aiContextHint: 'Viewer Recap: Available if a room member stepped in late.',
  },
  {
    id: 'the-art-of-waiting',
    title: 'The Art Of Waiting',
    category: 'Documentary',
    genres: ['Documentary', 'Philosophy'],
    description:
      'A hypnotic meditation on lobbies, ticket counters, and railway platforms: the strange beauty of stillness in an overstimulated era.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/the-art-of-waiting/poster_1920x1080.jpg',
    releaseYear: 2022,
    ratingStars: 4.3,
    contentRating: 'TV-G',
    durationSec: 4500,
    videoUrl:
      'http://10.0.2.2:8080/videos/the-art-of-waiting.mp4',
    aiContextHint: 'Philosophical Slow-TV for tranquil evenings.',
  },
  {
    id: 'startup-strays',
    title: 'Startup Strays',
    category: 'Comedy',
    genres: ['Tech', 'Comedy'],
    description:
      'Four junior engineers and an adopted stray dog attempt to launch an autonomous living room streaming service in just six frantic launch days.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/startup-strays/poster_1920x1080.jpg',
    releaseYear: 2024,
    ratingStars: 4.7,
    contentRating: 'TV-PG',
    durationSec: 4200,
    videoUrl:
      'http://10.0.2.2:8080/videos/startup-strays.mp4',
    aiContextHint: 'Room Alert: Engaging tech startup comedy!',
  },
];

export const fallbackCategories: ContentCategory[] = [
  {
    id: 'trending-featured',
    title: 'Featured & Trending on LivingFrame',
    subtitle: 'Curated for room-responsive viewing',
    items: [
      fallbackMediaItems[0], // Behind The Screams
      fallbackMediaItems[1], // Cereal Streamz
      fallbackMediaItems[2], // Feline Assistant
      fallbackMediaItems[3], // The Beige Knight
      fallbackMediaItems[8], // Startup Strays
    ],
  },
  {
    id: 'sci-fi-adventures',
    title: 'Living Room Sci-Fi & Speculative Cinema',
    subtitle: 'Immersive stories built for cinematic screens',
    items: [
      fallbackMediaItems[3], // The Beige Knight
      fallbackMediaItems[4], // Meditation In Beige
      fallbackMediaItems[6], // Parking Wars
      fallbackMediaItems[7], // The Art Of Waiting
    ],
  },
  {
    id: 'family-feline',
    title: 'Shared Living Room Favorites',
    subtitle: 'Delightful co-watching for the whole family',
    items: [
      fallbackMediaItems[2], // Feline Assistant
      fallbackMediaItems[5], // The Accounting Cats
      fallbackMediaItems[1], // Cereal Streamz
      fallbackMediaItems[0], // Behind The Screams
      fallbackMediaItems[4], // Meditation in Beige
    ],
  },
];
