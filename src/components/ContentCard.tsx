import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Pressable,
} from 'react-native';
import {MediaItem} from '../types/catalog';
import {colors, spacing} from '../theme/theme';
import {Icon} from './Icon';

export interface ContentCardProps {
  item: MediaItem;
  isFocused: boolean;
  onFocus: () => void;
  onBlur?: () => void;
  onPress: () => void;
  testID?: string;
  hasTVPreferredFocus?: boolean;
}

export const ContentCard = React.forwardRef<View, ContentCardProps>(
  (
    {
      item,
      isFocused,
      onFocus,
      onBlur,
      onPress,
      testID,
      hasTVPreferredFocus,
    },
    ref,
  ) => {
    return (
      <Pressable
        ref={ref}
        style={[
          styles.cardContainer,
          isFocused ? styles.cardContainerFocused : styles.cardContainerDefault,
        ]}
        onFocus={onFocus}
        onBlur={onBlur}
        onPress={onPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.category}, rated ${item.contentRating}`}
        hasTVPreferredFocus={hasTVPreferredFocus}>
        <View style={styles.imageWrapper}>
          <Image
            source={{uri: item.posterUrl}}
            style={styles.posterImage}
            resizeMode="cover"
          />
          {/* Subtle gradient dark bottom overlay for title contrast */}
          <View style={styles.posterOverlay} />

          {/* Trending or Content Rating Badge */}
          {item.trending && (
            <View style={styles.trendingBadge}>
              <Icon name="spark" size={8} color="#000000" />
              <Text style={styles.trendingBadgeText}>TRENDING</Text>
            </View>
          )}
        </View>

        <View style={styles.metaContainer}>
          <Text
            numberOfLines={1}
            style={[
              styles.cardTitle,
              isFocused ? styles.cardTitleFocused : styles.cardTitleDefault,
            ]}>
            {item.title}
          </Text>
          <View style={styles.subMetaRow}>
            <Text style={styles.genreText}>
              {item.genres.slice(0, 2).join(' • ')}
            </Text>
            <Text style={styles.yearText}>{item.releaseYear}</Text>
          </View>
        </View>
      </Pressable>
    );
  },
);

ContentCard.displayName = 'ContentCard';

const styles = StyleSheet.create({
  cardContainer: {
    width: spacing.cardWidth,
    height: spacing.cardHeight + 48,
    borderRadius: 14,
    marginRight: spacing.cardGap,
    overflow: 'hidden',
  },
  cardContainerDefault: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 2,
    borderColor: 'transparent',
    transform: [{scale: 1}],
  },
  cardContainerFocused: {
    backgroundColor: colors.surfaceCardElevated,
    borderWidth: 2.5,
    borderColor: colors.borderFocus,
    transform: [{scale: 1.06}],
    elevation: 8,
  },
  imageWrapper: {
    width: '100%',
    height: spacing.cardHeight,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: 'rgba(7, 10, 17, 0.4)',
  },
  trendingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.92)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  trendingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  metaContainer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardTitleDefault: {
    color: colors.textPrimary,
  },
  cardTitleFocused: {
    color: colors.primary,
  },
  subMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  genreText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  yearText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 6,
  },
});
