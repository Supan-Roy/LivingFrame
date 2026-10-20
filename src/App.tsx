import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {
  StyleSheet,
  View,
  ImageBackground,
  ScrollView,
  BackHandler,
} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import {
  useTVEventHandler,
  useKeplerBackHandler,
  HWEvent,
} from '@amazon-devices/react-native-kepler';
import {RoomProvider, useRoom} from './context/RoomContext';
import {ContentCategory, MediaItem} from './types/catalog';
import {fallbackCategories, fallbackMediaItems} from './data/catalogData';
import {CatalogService} from './services/catalogService';
import {Header} from './components/Header';
import {HeroBanner} from './components/HeroBanner';
import {ContentRow} from './components/ContentRow';
import {TitleDetailsModal} from './components/TitleDetailsModal';
import {AmbientRecapModal} from './components/AmbientRecapModal';
import {VideoPlayerView} from './components/VideoPlayerView';
import {NavFocusProvider, useNavRegistry} from './navigation/NavFocusContext';
import {useGestureNavigation} from './navigation/useGestureNavigation';
import {HERO_BUTTON_IDS, HERO_ROW_INDEX} from './navigation/focusGrid';
import type {NavCell, NavGrid, NavPosition} from './navigation/focusGrid';
import {colors} from './theme/theme';

export const LivingFrameHome = () => {
  const [categories, setCategories] = useState<ContentCategory[]>(fallbackCategories);
  const featuredRowItems = useMemo<MediaItem[]>(() => {
    return categories[0]?.items?.length ? categories[0].items : fallbackCategories[0].items;
  }, [categories]);
  const [featuredIndex, setFeaturedIndex] = useState<number>(0);
  const [featuredItem, setFeaturedItem] = useState<MediaItem>(
    fallbackCategories[0].items[0] || fallbackMediaItems[0],
  );
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [detailsModalItem, setDetailsModalItem] = useState<MediaItem | null>(null);
  const [recapModalItem, setRecapModalItem] = useState<MediaItem | null>(null);
  const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);
  const {roomState} = useRoom();
  const nav = useNavRegistry();

  // Vertical scroll following: the native focus engine reveals the focused card inside
  // a row (horizontal), but does not scroll the outer page for us, so we track each
  // row's offset and scroll the page when the focused row changes.
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsetsRef = useRef<Map<number, number>>(new Map());
  const lastScrolledRowRef = useRef<number>(HERO_ROW_INDEX);

  useEffect(() => {
    scrollRef.current?.scrollTo({y: 0, animated: false});
  }, []);

  const handleRowLayout = useCallback(
    (row: number, event: LayoutChangeEvent) => {
      rowOffsetsRef.current.set(row, event.nativeEvent.layout.y);
    },
    [],
  );

  const {reportFocus} = nav;
  const handleReportFocus = useCallback(
    (position: NavPosition) => {
      reportFocus(position);
      if (position.row === lastScrolledRowRef.current) {
        return;
      }
      lastScrolledRowRef.current = position.row;
      if (position.row === HERO_ROW_INDEX) {
        setFocusedItemId(null);
        setFeaturedItem(featuredRowItems[featuredIndex] || featuredRowItems[0]);
        scrollRef.current?.scrollTo({y: 0, animated: true});
        return;
      }
      const y = rowOffsetsRef.current.get(position.row);
      if (y !== undefined) {
        scrollRef.current?.scrollTo({y: Math.max(0, y - 16), animated: true});
      }
    },
    [reportFocus],
  );

  // Listen to remote play_video commands from telemetry server / gestures
  useEffect(() => {
    if (roomState.lastEvent?.type === 'play_video') {
      const targetId = (roomState.lastEvent.payload as any)?.itemId;
      const found = fallbackMediaItems.find(m => m.id === targetId) || featuredItem;
      setPlayingItem(prev => (prev?.id === found?.id ? prev : found));
    }
  }, [roomState.lastEvent, featuredItem]);

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
  // - If recap modal is open, dismiss recap modal
  // - If title details modal is open, dismiss details modal
  // - If video player is open, exit player to browse
  // - If at root screen, exit entire app and return to homescreen
  useEffect(() => {
    const onBackPress = () => {
      if (recapModalItem) {
        setRecapModalItem(null);
        return true;
      }
      if (detailsModalItem) {
        setDetailsModalItem(null);
        return true;
      }
      if (playingItem) {
        setPlayingItem(null);
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
          setFeaturedIndex(0);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const currentScreen: 'browse' | 'player' = playingItem ? 'player' : 'browse';

  // Auto-rotate hero spotlight every 5 seconds through each available title in the first row
  useEffect(() => {
    if (
      currentScreen !== 'browse' ||
      detailsModalItem !== null ||
      recapModalItem !== null ||
      focusedItemId !== null ||
      featuredRowItems.length <= 1
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      setFeaturedIndex(prevIndex => {
        const nextIndex = (prevIndex + 1) % featuredRowItems.length;
        setFeaturedItem(featuredRowItems[nextIndex]);
        return nextIndex;
      });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [
    currentScreen,
    detailsModalItem,
    recapModalItem,
    focusedItemId,
    featuredRowItems,
  ]);

  const handleCardFocus = useCallback(
    (item: MediaItem) => {
      setFocusedItemId(item.id);
      const idx = featuredRowItems.findIndex(m => m.id === item.id);
      if (idx !== -1) {
        setFeaturedIndex(idx);
      }
      setFeaturedItem(item);
    },
    [featuredRowItems],
  );

  const handleCardSelect = useCallback((item: MediaItem) => {
    setPlayingItem(item);
  }, []);

  const handleExplore = useCallback((item: MediaItem) => {
    setPlayingItem(item);
  }, []);

  const handleMoreInfo = useCallback((item: MediaItem) => {
    setDetailsModalItem(item);
  }, []);

  const handleRoomRecap = useCallback((item: MediaItem) => {
    setRecapModalItem(item);
  }, []);


  // Focusable grid: row 0 = hero actions, rows 1.. = content rows. Ids match the
  // components' registered refs. The header gesture switch is intentionally NOT here.
  const grid = useMemo<NavGrid>(() => {
    const heroRow: NavCell[] = [
      {id: HERO_BUTTON_IDS[0], onActivate: () => handleExplore(featuredItem)},
      {id: HERO_BUTTON_IDS[1], onActivate: () => handleMoreInfo(featuredItem)},
      {id: HERO_BUTTON_IDS[2], onActivate: () => handleRoomRecap(featuredItem)},
    ];
    const contentRows: NavCell[][] = categories.map(category =>
      category.items.map(item => ({
        id: `card-${category.id}-${item.id}`,
        onActivate: () => handleCardSelect(item),
      })),
    );
    return [heroRow, ...contentRows];
  }, [
    categories,
    featuredItem,
    handleExplore,
    handleMoreInfo,
    handleRoomRecap,
    handleCardSelect,
  ]);

  useGestureNavigation({
    grid,
    cursor: nav.cursor,
    refs: nav.refs,
    enabled:
      currentScreen === 'browse' && !detailsModalItem && !recapModalItem,
  });

  const currentHeroIndex = useMemo(() => {
    const idx = featuredRowItems.findIndex(m => m.id === featuredItem.id);
    return idx !== -1 ? idx : featuredIndex;
  }, [featuredRowItems, featuredItem.id, featuredIndex]);

  return (
    <NavFocusProvider
      registerRef={nav.registerRef}
      reportFocus={handleReportFocus}>
      <View style={styles.container}>
        {/* Browse Screen */}
        {currentScreen === 'browse' && (
          <ImageBackground
            source={require('./assets/background.png')}
            style={styles.container}>
            {/* Top TV Header Bar with LivingFrame Wordmark & Gesture Switch */}
            <Header />

            {/* Main TV Vertical Content Flow */}
            <ScrollView
              ref={scrollRef}
              style={styles.mainScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}>
              {/* Dynamic Hero Section */}
              <View onLayout={event => handleRowLayout(HERO_ROW_INDEX, event)}>
                <HeroBanner
                  item={featuredItem}
                  currentIndex={currentHeroIndex}
                  totalCount={featuredRowItems.length}
                  onExplore={handleExplore}
                  onMoreInfo={handleMoreInfo}
                  onRoomRecap={handleRoomRecap}
                />
              </View>

              {/* Content Rows */}
              {categories.map((category, index) => {
                const rowIndex = index + HERO_ROW_INDEX + 1;
                return (
                  <View
                    key={category.id}
                    onLayout={event => handleRowLayout(rowIndex, event)}>
                    <ContentRow
                      category={category}
                      rowIndex={rowIndex}
                      focusedItemId={focusedItemId}
                      onItemFocus={handleCardFocus}
                      onItemSelect={handleCardSelect}
                      isFirstRow={index === 0}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </ImageBackground>
        )}

        {/* Video Player Screen */}
        {currentScreen === 'player' && playingItem && (
          <VideoPlayerView
            key={playingItem.id}
            item={playingItem}
            visible={true}
            onClose={() => setPlayingItem(null)}
            onRoomRecap={(item) => {
              setRecapModalItem(item);
            }}
          />
        )}

        {/* Title Details Modal (as View overlay) */}
        {detailsModalItem && !playingItem && (
          <TitleDetailsModal
            item={detailsModalItem}
            visible={true}
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
        )}

        {/* Ambient Room Context Recap Modal (as View overlay) */}
        {recapModalItem && (
          <AmbientRecapModal
            item={recapModalItem}
            visible={true}
            onClose={() => setRecapModalItem(null)}
          />
        )}
      </View>
    </NavFocusProvider>
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
