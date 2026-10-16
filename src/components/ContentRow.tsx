import React, {useRef} from 'react';
import {StyleSheet, Text, View, ScrollView} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {ContentCategory, MediaItem} from '../types/catalog';
import {ContentCard} from './ContentCard';
import {colors, spacing} from '../theme/theme';

export interface ContentRowProps {
  category: ContentCategory;
  focusedItemId: string | null;
  onItemFocus: (item: MediaItem) => void;
  onItemSelect: (item: MediaItem) => void;
  isFirstRow?: boolean;
}

export const ContentRow = ({
  category,
  focusedItemId,
  onItemFocus,
  onItemSelect,
  isFirstRow,
}: ContentRowProps) => {
  const scrollViewRef = useRef<ScrollView>(null);

  const handleCardFocus = (item: MediaItem, index: number) => {
    onItemFocus(item);
    // Smooth auto-scroll for TV remote navigation
    const targetOffset = Math.max(
      0,
      index * (spacing.cardWidth + spacing.cardGap) - 48,
    );
    scrollViewRef.current?.scrollTo({x: targetOffset, animated: true});
  };

  return (
    <View style={styles.rowContainer}>
      <View style={styles.titleContainer}>
        <Text style={styles.categoryTitle}>{category.title}</Text>
        {category.subtitle && (
          <Text style={styles.categorySubtitle}>{category.subtitle}</Text>
        )}
      </View>

      <TVFocusGuideView style={styles.focusGuide}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {category.items.map((item, index) => (
            <ContentCard
              key={`${category.id}-${item.id}`}
              item={item}
              isFocused={focusedItemId === item.id}
              onFocus={() => handleCardFocus(item, index)}
              onPress={() => onItemSelect(item)}
              testID={`card-${category.id}-${item.id}`}
              hasTVPreferredFocus={isFirstRow && index === 0}
            />
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  rowContainer: {
    marginBottom: 24,
  },
  titleContainer: {
    paddingHorizontal: 48,
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  categorySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  focusGuide: {
    flexDirection: 'row',
  },
  scrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 8,
  },
});
