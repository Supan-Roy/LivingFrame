import React, {useState} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {MediaItem} from '../types/catalog';
import {colors} from '../theme/theme';
import {Icon} from './Icon';

export interface TitleDetailsModalProps {
  item: MediaItem | null;
  visible: boolean;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
  onRoomRecap: (item: MediaItem) => void;
}

export const TitleDetailsModal = ({
  item,
  visible,
  onClose,
  onPlay,
  onRoomRecap,
}: TitleDetailsModalProps) => {
  const [focusedBtn, setFocusedBtn] = useState<'play' | 'recap' | 'back' | null>(
    'play',
  );

  if (!item || !visible) {
    return null;
  }

  const formatDuration = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  return (
    <View style={styles.modalBackdrop} testID="title-details-modal">
        <View style={styles.modalCard}>
          {/* Top Hero Art with Overlay */}
          <View style={styles.mediaHeader}>
            <Image
              source={{uri: item.posterUrl}}
              style={styles.modalPoster}
              resizeMode="cover"
            />
            <View style={styles.modalOverlayGradient} />
            <View style={styles.headerInfo}>
              <View style={styles.badgeRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.badgeText}>
                    {item.category.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.ratingBadge}>
                  <Icon name="spark" size={9} color={colors.accentGold} />
                  <Text style={styles.ratingText}>{item.ratingStars.toFixed(1)}</Text>
                </View>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.metaRow}>
                {item.releaseYear} • {item.contentRating} • {formatDuration(item.durationSec)} • {item.genres.join(', ')}
              </Text>
            </View>
          </View>

          {/* Modal Content Body */}
          <ScrollView style={styles.bodyScroll}>
            <Text style={styles.synopsisLabel}>SYNOPSIS</Text>
            <Text style={styles.synopsisText}>{item.description}</Text>

            {item.aiContextHint && (
              <View style={styles.roomContextCard}>
                <View style={styles.roomContextTitleRow}>
                  <Icon name="spark" size={10} color={colors.accentOrange} />
                  <Text style={styles.roomContextTitle}>LIVINGFRAME ROOM AWARENESS</Text>
                </View>
                <Text style={styles.roomContextBody}>
                  {item.aiContextHint}
                </Text>
                <Text style={styles.roomContextSub}>
                  When viewers join mid-stream, LivingFrame uses room presence sensors to offer an adaptive 30-second context recap without spoiling plot twists.
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <TVFocusGuideView style={styles.buttonRow}>
              <Pressable
                style={[
                  styles.btn,
                  styles.primaryBtn,
                  focusedBtn === 'play' && styles.btnFocused,
                ]}
                onFocus={() => setFocusedBtn('play')}
                onBlur={() => setFocusedBtn(null)}
                onPress={() => onPlay(item)}
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}
                hasTVPreferredFocus>
                <View style={styles.btnIcon}>
                  <Icon name="play" size={12} color="#000000" />
                </View>
                <Text style={styles.primaryBtnText}>Play Title</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btn,
                  styles.aiBtn,
                  focusedBtn === 'recap' && styles.btnFocused,
                ]}
                onFocus={() => setFocusedBtn('recap')}
                onBlur={() => setFocusedBtn(null)}
                onPress={() => onRoomRecap(item)}
                accessibilityRole="button"
                accessibilityLabel="Catch Me Up Room Recap">
                <View style={styles.btnIcon}>
                  <Icon name="spark" size={12} color={colors.accentOrange} />
                </View>
                <Text style={styles.aiBtnText}>Room AI Recap</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btn,
                  styles.secondaryBtn,
                  focusedBtn === 'back' && styles.btnFocused,
                ]}
                onFocus={() => setFocusedBtn('back')}
                onBlur={() => setFocusedBtn(null)}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Back to Browse">
                <View style={styles.btnIcon}>
                  <Icon name="chevron-left" size={12} color="#FFFFFF" />
                </View>
                <Text style={styles.secondaryBtnText}>Back to Browse</Text>
              </Pressable>
            </TVFocusGuideView>
          </ScrollView>
        </View>
      </View>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    zIndex: 100,
    elevation: 100,
  },
  modalCard: {
    width: 960,
    maxHeight: 640,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  mediaHeader: {
    height: 260,
    width: '100%',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  modalPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  modalOverlayGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  headerInfo: {
    padding: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000000',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    borderColor: colors.accentGold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentGold,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  metaRow: {
    fontSize: 14,
    color: '#94A3B8',
  },
  bodyScroll: {
    padding: 28,
  },
  synopsisLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 6,
  },
  synopsisText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#E2E8F0',
    marginBottom: 20,
  },
  roomContextCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.accentOrange,
    marginBottom: 24,
  },
  roomContextTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  roomContextTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accentOrange,
    letterSpacing: 0.8,
  },
  roomContextBody: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  roomContextSub: {
    fontSize: 12,
    lineHeight: 18,
    color: '#94A3B8',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 14,
  },
  btnIcon: {
    marginRight: 8,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  aiBtn: {
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderWidth: 1.5,
    borderColor: colors.accentOrange,
  },
  aiBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accentOrange,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    transform: [{scale: 1.06}],
    elevation: 8,
  },
});
