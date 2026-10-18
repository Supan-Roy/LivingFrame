import React, {useState} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Pressable,
} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {MediaItem} from '../types/catalog';
import {colors} from '../theme/theme';

export interface HeroBannerProps {
  item: MediaItem;
  onExplore: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
  onRoomRecap: (item: MediaItem) => void;
}

export const HeroBanner = ({
  item,
  onExplore,
  onMoreInfo,
  onRoomRecap,
}: HeroBannerProps) => {
  const [focusedBtn, setFocusedBtn] = useState<'explore' | 'info' | 'recap' | null>(
    null,
  );

  const formatDuration = (sec: number) => {
    if (!sec || sec < 300) {
      return '1h 45m';
    }
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <View style={styles.heroContainer}>
      {/* Subtle Atmospheric Backdrop (low opacity so baked-in poster text never clashes) */}
      <Image
        source={{uri: item.posterUrl}}
        style={styles.ambientBackdrop}
        resizeMode="cover"
      />
      <View style={styles.backdropOverlay} />

      {/* Main Spotlight Flow: Left Info + Right Framed 16:9 Showcase Card */}
      <View style={styles.spotlightContainer}>
        {/* Left Column: Metadata & TV Controls */}
        <View style={styles.leftColumn}>
          {/* Badge Row */}
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>
                {item.category.toUpperCase()}
              </Text>
            </View>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeIcon}>⚡</Text>
              <Text style={styles.aiBadgeText}>ROOM AWARE</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>

          {/* Metadata Row */}
          <View style={styles.metaRow}>
            <Text style={styles.ratingText}>★ {item.ratingStars.toFixed(1)}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>{item.releaseYear}</Text>
            <Text style={styles.metaDot}>•</Text>
            <View style={styles.contentRatingPill}>
              <Text style={styles.contentRatingText}>{item.contentRating}</Text>
            </View>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>{formatDuration(item.durationSec)}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.genresText}>{item.genres.slice(0, 2).join(' / ')}</Text>
          </View>

          {/* Synopsis */}
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>

          {/* TV Remote Interactive Buttons */}
          <TVFocusGuideView style={styles.actionRow}>
            <Pressable
              style={[
                styles.actionButton,
                styles.primaryButton,
                focusedBtn === 'explore' && styles.buttonFocused,
              ]}
              onFocus={() => setFocusedBtn('explore')}
              onBlur={() => setFocusedBtn(null)}
              onPress={() => onExplore(item)}
              hasTVPreferredFocus={true}
              accessibilityRole="button"
              accessibilityLabel={`Watch ${item.title}`}
              testID="hero-btn-explore">
              <Text style={styles.primaryButtonIcon}>▶</Text>
              <Text style={styles.primaryButtonText}>Watch Now</Text>
            </Pressable>

            <Pressable
              style={[
                styles.actionButton,
                styles.secondaryButton,
                focusedBtn === 'info' && styles.buttonFocused,
              ]}
              onFocus={() => setFocusedBtn('info')}
              onBlur={() => setFocusedBtn(null)}
              onPress={() => onMoreInfo(item)}
              accessibilityRole="button"
              accessibilityLabel={`More info about ${item.title}`}
              testID="hero-btn-more-info">
              <Text style={styles.secondaryButtonIcon}>ℹ</Text>
              <Text style={styles.secondaryButtonText}>Details</Text>
            </Pressable>

            <Pressable
              style={[
                styles.actionButton,
                styles.aiRecapButton,
                focusedBtn === 'recap' && styles.buttonFocused,
              ]}
              onFocus={() => setFocusedBtn('recap')}
              onBlur={() => setFocusedBtn(null)}
              onPress={() => onRoomRecap(item)}
              accessibilityRole="button"
              accessibilityLabel={`Room Context Recap for ${item.title}`}
              testID="hero-btn-room-recap">
              <Text style={styles.aiButtonIcon}>⚡</Text>
              <Text style={styles.aiButtonText}>Catch Me Up</Text>
            </Pressable>
          </TVFocusGuideView>
        </View>

        {/* Right Column: Clean Framed 16:9 Showcase Thumbnail Card */}
        <View style={styles.showcaseCard}>
          <Image
            source={{uri: item.posterUrl}}
            style={styles.showcaseImage}
            resizeMode="cover"
          />
          <View style={styles.showcaseOverlay} />
          <View style={styles.showcaseBadge}>
            <Text style={styles.showcaseBadgeText}>FEATURED SPOTLIGHT</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroContainer: {
    height: 275,
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  ambientBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.15,
  },
  backdropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(7, 10, 17, 0.72)',
  },
  spotlightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    width: '100%',
    zIndex: 5,
  },
  leftColumn: {
    flex: 1,
    paddingRight: 32,
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    marginRight: 8,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.6)',
  },
  aiBadgeIcon: {
    fontSize: 10,
    color: colors.accentOrange,
    marginRight: 4,
  },
  aiBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.accentOrange,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentGold,
  },
  metaDot: {
    fontSize: 13,
    color: colors.textMuted,
    marginHorizontal: 7,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  contentRatingPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  contentRatingText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  genresText: {
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  description: {
    fontSize: 13.5,
    lineHeight: 19,
    color: '#CBD5E1',
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonIcon: {
    fontSize: 13,
    color: '#000000',
    marginRight: 6,
    fontWeight: '900',
  },
  primaryButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#000000',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  secondaryButtonIcon: {
    fontSize: 13,
    color: '#FFFFFF',
    marginRight: 6,
    fontWeight: 'bold',
  },
  secondaryButtonText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  aiRecapButton: {
    backgroundColor: 'rgba(255, 107, 53, 0.16)',
    borderWidth: 1.5,
    borderColor: colors.accentOrange,
  },
  aiButtonIcon: {
    fontSize: 13,
    color: colors.accentOrange,
    marginRight: 6,
  },
  aiButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.accentOrange,
  },
  buttonFocused: {
    transform: [{scale: 1.08}],
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    elevation: 8,
  },
  showcaseCard: {
    width: 320,
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    backgroundColor: '#0F172A',
    position: 'relative',
    elevation: 8,
  },
  showcaseImage: {
    width: '100%',
    height: '100%',
  },
  showcaseOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(7, 10, 17, 0.45)',
  },
  showcaseBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(7, 10, 17, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.5)',
  },
  showcaseBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
  },
});
