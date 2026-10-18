import React, {useState, useEffect, useCallback} from 'react';
import {
  StyleSheet,
  View,
  ImageBackground,
  ScrollView,
  BackHandler,
} from 'react-native';
import {
  useTVEventHandler,
  useKeplerBackHandler,
  HWEvent,
} from '@amazon-devices/react-native-kepler';
import {RoomProvider} from './context/RoomContext';
import {ContentCategory, MediaItem} from './types/catalog';
import {fallbackCategories, fallbackMediaItems} from './data/catalogData';
import {CatalogService} from './services/catalogService';
import {Header} from './components/Header';
import {HeroBanner} from './components/HeroBanner';
import {ContentRow} from './components/ContentRow';
import {TitleDetailsModal} from './components/TitleDetailsModal';
import {AmbientRecapModal} from './components/AmbientRecapModal';
import {GestureReactionOverlay} from './components/GestureReactionOverlay';
import {VideoPlayerView} from './components/VideoPlayerView';
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
  const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);

  const keplerBackHandler = useKeplerBackHandler();

  const handleExitApp = useCallback(() => {
    if (keplerBackHandler && typeof keplerBackHandler.exitApp === 'function') {
      keplerBackHandler.exitApp();
    } else if (BackHandler && typeof BackHandler.exitApp === 'function') {
      BackHandler.exitApp();
    }
  }, [keplerBackHandler]);

  // Handle remote Home button to exit the entire app and return homescreen
  useTVEventHandler((evt: HWEvent) => {
    if (!evt || !evt.eventType) {
      return;
    }
    const eventType = evt.eventType.toLowerCase();
    if (
      eventType === 'home' ||
      eventType === 'root_menu' ||
      eventType === 'media_top_menu' ||
      eventType.includes('home')
    ) {
      setPlayingItem(null);
      setDetailsModalItem(null);
      setRecapModalItem(null);
      handleExitApp();
    }
  });

  // Handle remote Back button:
  // - If video player is open, exit player
  // - If modal is open, dismiss modal
  // - If at root screen, exit entire app and return to homescreen
  useEffect(() => {
    const onBackPress = () => {
      if (playingItem) {
        setPlayingItem(null);
        return true;
      }
      if (detailsModalItem || recapModalItem) {
        setDetailsModalItem(null);
        setRecapModalItem(null);
        return true;
      }
      handleExitApp();
      return true;
    };

    let removeSub: (() => void) | undefined;
    if (keplerBackHandler && typeof keplerBackHandler.addEventListener === 'function') {
      const sub = keplerBackHandler.addEventListener('hardwareBackPress', onBackPress);
      if (sub && typeof sub.remove === 'function') {
        removeSub = () => sub.remove();
      }
    } else if (BackHandler && typeof BackHandler.addEventListener === 'function') {
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      if (sub && typeof sub.remove === 'function') {
        removeSub = () => sub.remove();
      }
    }

    return () => {
      if (removeSub) {
        removeSub();
      }
    };
  }, [playingItem, detailsModalItem, recapModalItem, handleExitApp, keplerBackHandler]);

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
    setPlayingItem(item);
  };

  const handleMoreInfo = (item: MediaItem) => {
    setDetailsModalItem(item);
  };

  const handleRoomRecap = (item: MediaItem) => {
    setRecapModalItem(item);
  };

  if (playingItem) {
    return (
      <View style={styles.container}>
        <VideoPlayerView
          item={playingItem}
          visible={true}
          onClose={() => setPlayingItem(null)}
          onRoomRecap={(item) => {
            setPlayingItem(null);
            setRecapModalItem(item);
          }}
        />
      </View>
    );
  }

  return (
    <ImageBackground
      source={require('./assets/background.png')}
      style={styles.container}>
      {/* Top TV Header Bar with LivingFrame Wordmark & Ambient Sensor Status */}
      <Header />

      {/* Real-time Room Awareness Gesture Reaction Overlay */}
      <GestureReactionOverlay onOpenRecap={() => setRecapModalItem(featuredItem)} />

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
        onPlay={(item) => {
          setDetailsModalItem(null);
          setPlayingItem(item);
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
