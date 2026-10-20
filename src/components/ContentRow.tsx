import React, {useRef} from 'react';
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

  const handleCardFocus = (item: MediaItem, index: number) => {
    onItemFocus(item);
    navFocus?.reportFocus({row: rowIndex, col: index});
    // Smooth auto-scroll for TV remote / gesture navigation
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
