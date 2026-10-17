import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';

interface GestureReactionOverlayProps {
  onOpenRecap?: () => void;
}

export const GestureReactionOverlay = ({onOpenRecap}: GestureReactionOverlayProps) => {
  const {roomState, dismissGesture} = useRoom();
  const [isBtnFocused, setIsBtnFocused] = React.useState(false);

  if (!roomState.activeGesture) {
    return null;
  }

  const handleAction = () => {
    dismissGesture();
    if (onOpenRecap) {
      onOpenRecap();
    }
  };

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none" testID="gesture-reaction-overlay">
      <View style={styles.reactionCard}>
        {/* Glow Header Row */}
        <View style={styles.cardHeader}>
          <View style={styles.gestureIconBadge}>
            <Text style={styles.gestureIcon}>✋</Text>
          </View>
          <View style={styles.headerTextCol}>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>HAND-RAISE DETECTED</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.pulseDot} />
                <Text style={styles.liveText}>LIVE SENSOR</Text>
              </View>
            </View>
            <Text style={styles.subtitleText}>
              Room vision detected viewer engagement • Quick recap available
            </Text>
          </View>
        </View>

        {/* Action Button Row */}
        <TVFocusGuideView style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, isBtnFocused && styles.actionBtnFocused]}
            onFocus={() => setIsBtnFocused(true)}
            onBlur={() => setIsBtnFocused(false)}
            onPress={handleAction}
            accessibilityRole="button"
            accessibilityLabel="Open Context Recap"
            testID="gesture-open-recap-btn">
            <Text style={styles.actionBtnText}>⚡ Open Context Recap</Text>
          </Pressable>

          <Pressable
            style={styles.dismissBtn}
            onPress={dismissGesture}
            accessibilityRole="button"
            accessibilityLabel="Dismiss Alert"
            testID="gesture-dismiss-btn">
            <Text style={styles.dismissBtnText}>✕ Dismiss</Text>
          </Pressable>
        </TVFocusGuideView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 72,
    right: 48,
    zIndex: 999,
    elevation: 20,
  },
  reactionCard: {
    width: 440,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 18,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.45,
    shadowRadius: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  gestureIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 229, 255, 0.18)',
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  gestureIcon: {
    fontSize: 26,
  },
  headerTextCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.primary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentEmerald,
    marginRight: 5,
  },
  liveText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.accentEmerald,
  },
  subtitleText: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  actionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{scale: 1.05}],
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  dismissBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  dismissBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
  },
});
