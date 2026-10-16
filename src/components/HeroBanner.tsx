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
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <View style={styles.heroContainer}>
      {/* Background Poster Image */}
      <Image
        source={{uri: item.posterUrl}}
        style={styles.heroBackground}
        resizeMode="cover"
      />

      {/* Cinematic Gradient Mask Layers */}
      <View style={styles.gradientLeft} />
      <View style={styles.gradientBottom} />
      <View style={styles.gradientTop} />

      {/* Hero Content Overlay */}
      <View style={styles.contentOverlay}>
        {/* Category & AI Room Badge */}
        <View style={styles.badgeRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>
              {item.category.toUpperCase()}
            </Text>
          </View>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeIcon}>⚡</Text>
            <Text style={styles.aiBadgeText}>LIVINGFRAME INTELLIGENCE</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>

        {/* Metadata Row: Rating, Year, Content Rating, Duration, Genres */}
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
          <Text style={styles.genresText}>{item.genres.join(' / ')}</Text>
        </View>

        {/* Synopsis */}
        <Text style={styles.description} numberOfLines={3}>
          {item.description}
        </Text>

        {/* Room Context Note */}
        {item.aiContextHint && (
          <View style={styles.contextHintContainer}>
            <Text style={styles.contextHintText}>
              <Text style={styles.contextHintBold}>Room Awareness: </Text>
              {item.aiContextHint}
            </Text>
          </View>
        )}

        {/* Action Buttons: Explore & More Info & Room AI Recap */}
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
            accessibilityRole="button"
            accessibilityLabel={`Explore ${item.title}`}
            testID="hero-btn-explore">
            <Text style={styles.primaryButtonIcon}>▶</Text>
            <Text style={styles.primaryButtonText}>Explore & Watch</Text>
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
            <Text style={styles.secondaryButtonText}>More Info</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  heroContainer: {
    height: 380,
    width: '100%',
    position: 'relative',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  heroBackground: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '72%',
    height: '100%',
    opacity: 0.85,
  },
  gradientLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '65%',
    backgroundColor: colors.background,
  },
  gradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    backgroundColor: 'transparent',
  },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(7, 10, 17, 0.4)',
  },
  contentOverlay: {
    paddingHorizontal: 48,
    maxWidth: 780,
    zIndex: 5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.primary,
    marginRight: 10,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.6)',
  },
  aiBadgeIcon: {
    fontSize: 11,
    color: colors.accentOrange,
    marginRight: 4,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accentOrange,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentGold,
  },
  metaDot: {
    fontSize: 14,
    color: colors.textMuted,
    marginHorizontal: 8,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  contentRatingPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  contentRatingText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  genresText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#CBD5E1',
    marginBottom: 10,
  },
  contextHintContainer: {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: 14,
  },
  contextHintText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  contextHintBold: {
    fontWeight: '700',
    color: colors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 8,
    marginRight: 14,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonIcon: {
    fontSize: 15,
    color: '#000000',
    marginRight: 8,
    fontWeight: '900',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  secondaryButtonIcon: {
    fontSize: 15,
    color: '#FFFFFF',
    marginRight: 8,
    fontWeight: 'bold',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  aiRecapButton: {
    backgroundColor: 'rgba(255, 107, 53, 0.16)',
    borderWidth: 1.5,
    borderColor: colors.accentOrange,
  },
  aiButtonIcon: {
    fontSize: 14,
    color: colors.accentOrange,
    marginRight: 7,
  },
  aiButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentOrange,
  },
  buttonFocused: {
    transform: [{scale: 1.08}],
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    elevation: 8,
  },
});
