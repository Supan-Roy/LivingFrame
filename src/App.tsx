import React, {useState, useEffect} from 'react';
import {
  StyleSheet,
  ImageBackground,
  ScrollView,
} from 'react-native';
import {RoomProvider} from './context/RoomContext';
import {ContentCategory, MediaItem} from './types/catalog';
import {fallbackCategories, fallbackMediaItems} from './data/catalogData';
import {CatalogService} from './services/catalogService';
import {Header} from './components/Header';
import {HeroBanner} from './components/HeroBanner';
import {ContentRow} from './components/ContentRow';
import {TitleDetailsModal} from './components/TitleDetailsModal';
import {AmbientRecapModal} from './components/AmbientRecapModal';
import {colors} from './theme/theme';

export const LivingFrameHome = () => {
  const [categories, setCategories] = useState<ContentCategory[]>(fallbackCategories);
  const [featuredItem, setFeaturedItem] = useState<MediaItem>(
    fallbackCategories[0].items[0] || fallbackMediaItems[0],
  );
  const [focusedItemId, setFocusedItemId] = useState<string | null>(
    fallbackCategories[0].items[0]?.id || null,
  );
  const [detailsModalItem, setDetailsModalItem] = useState<MediaItem | null>(null);
  const [recapModalItem, setRecapModalItem] = useState<MediaItem | null>(null);

  // Fetch verified catalog updates on load
  useEffect(() => {
    let isMounted = true;
    CatalogService.getCategories().then(({categories: loadedCategories}) => {
      if (isMounted && loadedCategories.length > 0) {
        setCategories(loadedCategories);
        if (loadedCategories[0]?.items[0]) {
          setFeaturedItem(loadedCategories[0].items[0]);
          setFocusedItemId(loadedCategories[0].items[0].id);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCardFocus = (item: MediaItem) => {
    setFocusedItemId(item.id);
    setFeaturedItem(item);
  };

  const handleCardSelect = (item: MediaItem) => {
    setDetailsModalItem(item);
  };

  const handleExplore = (item: MediaItem) => {
    setDetailsModalItem(item);
  };

  const handleMoreInfo = (item: MediaItem) => {
    setDetailsModalItem(item);
  };

  const handleRoomRecap = (item: MediaItem) => {
    setRecapModalItem(item);
  };

  return (
    <ImageBackground
      source={require('./assets/background.png')}
      style={styles.container}>
      {/* Top TV Header Bar with LivingFrame Wordmark & Ambient Sensor Status */}
      <Header />

      {/* Main TV Vertical Content Flow */}
      <ScrollView
        style={styles.mainScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* Dynamic Hero Section */}
        <HeroBanner
          item={featuredItem}
          onExplore={handleExplore}
          onMoreInfo={handleMoreInfo}
          onRoomRecap={handleRoomRecap}
        />

        {/* Content Rows */}
        {categories.map((category, index) => (
          <ContentRow
            key={category.id}
            category={category}
            focusedItemId={focusedItemId}
            onItemFocus={handleCardFocus}
            onItemSelect={handleCardSelect}
            isFirstRow={index === 0}
          />
        ))}
      </ScrollView>

      {/* Title Details Modal */}
      <TitleDetailsModal
        item={detailsModalItem}
        visible={Boolean(detailsModalItem)}
        onClose={() => setDetailsModalItem(null)}
        onPlay={(_item) => {
          // Future playback milestone trigger
          setDetailsModalItem(null);
        }}
        onRoomRecap={(item) => {
          setDetailsModalItem(null);
          setRecapModalItem(item);
        }}
      />

      {/* Ambient Room Context Recap Modal */}
      <AmbientRecapModal
        item={recapModalItem}
        visible={Boolean(recapModalItem)}
        onClose={() => setRecapModalItem(null)}
      />
    </ImageBackground>
  );
};

export const App = () => {
  return (
    <RoomProvider>
      <LivingFrameHome />
    </RoomProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
});
