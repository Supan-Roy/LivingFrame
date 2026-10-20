import React, {useRef, useEffect} from 'react';
import {StyleSheet, Text, View, ScrollView} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {ContentCategory, MediaItem} from '../types/catalog';
import {ContentCard} from './ContentCard';
import {useNavFocus} from '../navigation/NavFocusContext';
import {colors, spacing} from '../theme/theme';

export interface ContentRowProps {
  category: ContentCategory;
  rowIndex: number;
  focusedItemId: string | null;
  onItemFocus: (item: MediaItem) => void;
  onItemSelect: (item: MediaItem) => void;
  isFirstRow?: boolean;
}

export const ContentRow = ({
  category,
  rowIndex,
  focusedItemId,
  onItemFocus,
  onItemSelect,
  isFirstRow,
}: ContentRowProps) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const navFocus = useNavFocus();

  const scrollToIndex = (index: number) => {
    // Keep first 3 items stable; only scroll for items that extend toward/past edge
    const targetOffset =
      index < 3
        ? 0
        : Math.max(0, (index - 2) * (spacing.cardWidth + spacing.cardGap));
    scrollViewRef.current?.scrollTo({x: targetOffset, animated: true});
  };

  const handleCardFocus = (item: MediaItem, index: number) => {
    onItemFocus(item);
    navFocus?.reportFocus({row: rowIndex, col: index});
    scrollToIndex(index);
  };

  // Keep horizontal row scroll smoothly aligned whenever focusedItemId changes
  useEffect(() => {
    if (!focusedItemId) {
      return;
    }
    const index = category.items.findIndex(item => item.id === focusedItemId);
    if (index !== -1) {
      scrollToIndex(index);
    }
  }, [focusedItemId, category.items]);

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
          {category.items.map((item, index) => {
            const cellId = `card-${category.id}-${item.id}`;
            return (
              <ContentCard
                key={cellId}
                ref={navFocus?.registerRef(cellId)}
                item={item}
                isFocused={focusedItemId === item.id}
                onFocus={() => handleCardFocus(item, index)}
                onPress={() => onItemSelect(item)}
                testID={cellId}
                hasTVPreferredFocus={false}
              />
            );
          })}
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
