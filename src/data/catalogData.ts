import {MediaItem, ContentCategory} from '../types/catalog';

export const fallbackMediaItems: MediaItem[] = [
  {
    id: 'amazon-dev-hackathon',
    title: 'Build, Ship, Shape: Hackathon 2026',
    category: 'Featured',
    genres: ['Tech', 'Documentary', 'Innovation'],
    description:
      'The premier Amazon Developer Hackathon. $190,000 in prizes across four tracks: build groundbreaking, responsive experiences on Fire TV, Alexa+, Ring, and Bee. Open to creators worldwide on Vega OS.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/amazon-dev-hackathon/amazon-dev-hackathon.jpg',
    releaseYear: 2026,
    ratingStars: 5.0,
    contentRating: 'TV-G',
    durationSec: 2040,
    trending: true,
    videoUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/amazon-dev-hackathon/amazon-dev-hackathon.mp4',
    aiContextHint:
      'Room Activity: 2 viewers engaged. Recommended for developers exploring next-gen Fire TV apps.',
  },
  {
    id: 'adbt-quest',
    title: 'ADBT Quest',
    category: 'Sci-Fi',
    genres: ['Adventure', 'Comedy', 'AI'],
    description:
      'Gio and Byte team up to master the Vega OS frontier. Battling the slow dungeon, conquering the crash boss, and crafting a zero-hallucination interactive experience for the big screen.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/adbt-quest/adbt-quest.jpg',
    releaseYear: 2026,
    ratingStars: 5.0,
    contentRating: 'TV-G',
    durationSec: 6600,
    trending: true,
    videoUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/adbt-quest/adbt-quest.mp4',
    aiContextHint:
      'Viewer Insight: High-energy tech humor suited for group co-watching.',
  },
  {
    id: 'vega',
    title: 'Aliens From Vega',
    category: 'Sci-Fi',
    genres: ['Sci-Fi', 'Mystery', 'Space'],
    description:
      'Deep-space signals from Vega 4 intersect Earth broadcast networks. When living room screens spontaneously decrypt alien frequencies, a small suburban family becomes humanity’s sole translators.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/aliens-from-vega/vega.jpg',
    releaseYear: 2022,
    ratingStars: 4.8,
    contentRating: 'TV-PG',
    durationSec: 7200,
    trending: true,
    videoUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/aliens-from-vega/vega.mp4',
    aiContextHint:
      'Ambient Mode: Cinematic dimming recommended for high suspense.',
  },
  {
    id: 'behind-the-screams',
    title: 'Behind The Screams',
    category: 'Comedy',
    genres: ['Comedy', 'Mockumentary'],
    description:
      'An affectionate, hilarious look inside the world of professional horror-movie background screamers, vocal coaches, and the subtle art of running in fear.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/behind-the-screams/poster_1920x1080.jpg',
    releaseYear: 2022,
    ratingStars: 4.6,
    contentRating: 'TV-14',
    durationSec: 5100,
    aiContextHint: 'Family Room: Humor rated suitable for casual evening viewing.',
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
    aiContextHint: 'Morning Routine: Upbeat tone suitable for morning coffee & kids.',
  },
  {
    id: 'feline-assistant',
    title: 'Feline Assistant',
    category: 'Feline-Friendly',
    genres: ['Comedy', 'Pets', 'Workplace'],
    description:
      'Remote work hits maximum friction when Barnaby the tabby is promoted to Senior Vice President of Keyboard Napping and Zoom Call Interruptions.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/feline-assistant/poster_1920x1080.jpg',
    releaseYear: 2019,
    ratingStars: 4.9,
    contentRating: 'TV-G',
    durationSec: 3300,
    trending: true,
    aiContextHint: 'Pet Alert: Low frequency purr track calms room pets.',
  },
  {
    id: 'the-accounting-cats',
    title: 'The Accounting Cats',
    category: 'Feline-Friendly',
    genres: ['Comedy', 'Drama'],
    description:
      'Spreadsheets, quarterly earnings reports, and audited yarn reserves. Follow the most thorough feline CPAs on Wall Street.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/the-accounting-cats/poster_1920x1080.jpg',
    releaseYear: 2020,
    ratingStars: 4.8,
    contentRating: 'TV-G',
    durationSec: 3840,
    aiContextHint: 'Lighthearted Comedy: Ideal for multi-generational viewing.',
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
    aiContextHint:
      'Ambient Sensing: Ideal backdrop when room conversations are active.',
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
    releaseYear: 2020,
    ratingStars: 4.4,
    contentRating: 'TV-PG',
    durationSec: 5400,
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
    releaseYear: 2021,
    ratingStars: 4.3,
    contentRating: 'TV-G',
    durationSec: 4500,
    aiContextHint: 'Philosophical Slow-TV for tranquil evenings.',
  },
  {
    id: 'the-beige-knight',
    title: 'The Beige Knight',
    category: 'Sci-Fi',
    genres: ['Action', 'Fantasy'],
    description:
      'In a monochrome kingdom on the outer rings of Vega, one solitary defender rises equipped with understated armor and absolute conviction.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/the-beige-knight/poster_1920x1080.jpg',
    releaseYear: 2021,
    ratingStars: 4.6,
    contentRating: 'TV-14',
    durationSec: 6900,
    aiContextHint: 'Action Mode: Rich surround effects activated.',
  },
  {
    id: 'startup-strays',
    title: 'Startup Strays',
    category: 'Comedy',
    genres: ['Tech', 'Comedy'],
    description:
      'Four junior engineers and an adopted stray dog attempt to launch an autonomous living room streaming service in just six hackathon days.',
    posterUrl:
      'https://giolaq.github.io/scrap-tv-feed/content/startup-strays/poster_1920x1080.jpg',
    releaseYear: 2024,
    ratingStars: 4.7,
    contentRating: 'TV-PG',
    durationSec: 4200,
    aiContextHint: 'Inspirational Hackathon Spirit: High relevance to current room!',
  },
];

export const fallbackCategories: ContentCategory[] = [
  {
    id: 'trending-featured',
    title: 'Featured & Trending on LivingFrame',
    subtitle: 'Curated for room-responsive viewing',
    items: [
      fallbackMediaItems[0], // Hackathon
      fallbackMediaItems[1], // ADBT Quest
      fallbackMediaItems[2], // Vega
      fallbackMediaItems[5], // Feline Assistant
      fallbackMediaItems[11], // Startup Strays
    ],
  },
  {
    id: 'sci-fi-adventures',
    title: 'Living Room Sci-Fi & Speculative Cinema',
    subtitle: 'Immersive stories built for cinematic screens',
    items: [
      fallbackMediaItems[1], // ADBT Quest
      fallbackMediaItems[2], // Vega
      fallbackMediaItems[10], // Beige Knight
      fallbackMediaItems[8], // Parking Wars
    ],
  },
  {
    id: 'family-feline',
    title: 'Shared Living Room Favorites',
    subtitle: 'Delightful co-watching for the whole family',
    items: [
      fallbackMediaItems[5], // Feline Assistant
      fallbackMediaItems[6], // Accounting Cats
      fallbackMediaItems[4], // Cereal Streamz
      fallbackMediaItems[3], // Behind Screams
      fallbackMediaItems[7], // Meditation in Beige
      fallbackMediaItems[9], // Art of Waiting
    ],
  },
];
