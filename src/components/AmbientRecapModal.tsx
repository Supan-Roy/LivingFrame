import React, {useState} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {MediaItem} from '../types/catalog';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';

export interface AmbientRecapModalProps {
  item: MediaItem | null;
  visible: boolean;
  onClose: () => void;
}

export const AmbientRecapModal = ({
  item,
  visible,
  onClose,
}: AmbientRecapModalProps) => {
  const {roomState} = useRoom();
  const [isBtnFocused, setIsBtnFocused] = useState(false);

  if (!item || !visible) {
    return null;
  }

  return (
    <View style={styles.modalBackdrop} testID="ambient-recap-modal">
        <View style={styles.recapCard}>
          {/* Header */}
          <View style={styles.recapHeader}>
            <View style={styles.aiGlowIcon}>
              <Text style={styles.glowIconText}>⚡</Text>
            </View>
            <View>
              <Text style={styles.recapHeaderTitle}>
                LivingFrame Contextual Recap
              </Text>
              <Text style={styles.recapHeaderSubtitle}>
                AI ROOM INTELLIGENCE • {roomState.viewersPresent} VIEWERS PRESENT
              </Text>
            </View>
          </View>

          {/* Content */}
          <View style={styles.recapBody}>
            <Text style={styles.focusTitleLabel}>CURRENT FOCUS</Text>
            <Text style={styles.focusTitleText}>{item.title}</Text>

            <View style={styles.narrativeBox}>
              <Text style={styles.narrativeHeading}>
                Catch-Up Summary (Zero Spoilers)
              </Text>
              <Text style={styles.narrativeText}>
                {item.title} centers on {item.description.slice(0, 180)}...
              </Text>
              <View style={styles.keyCluePill}>
                <Text style={styles.keyClueText}>
                  💡 Viewer Note: High conversational engagement detected in room. Tone adapted to shared entertainment.
                </Text>
              </View>
            </View>

            <View style={styles.visionSensorRow}>
              <View style={styles.sensorStatusIndicator}>
                <View style={styles.greenDot} />
                <Text style={styles.sensorStatusText}>
                  Phone Vision Sensor: Active ({roomState.sensorDeviceName})
                </Text>
              </View>
              <Text style={styles.gestureHintText}>
                Raise hand ✋ to bring up character bio anytime
              </Text>
            </View>
          </View>

          {/* Action button */}
          <TVFocusGuideView style={styles.footerRow}>
            <Pressable
              style={[styles.resumeBtn, isBtnFocused && styles.resumeBtnFocused]}
              onFocus={() => setIsBtnFocused(true)}
              onBlur={() => setIsBtnFocused(false)}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Got it, resume viewing"
              hasTVPreferredFocus>
              <Text style={styles.resumeBtnText}>Got it, Resume Viewing</Text>
            </Pressable>
          </TVFocusGuideView>
        </View>
      </View>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 16, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    elevation: 100,
  },
  recapCard: {
    width: 820,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.accentOrange,
    padding: 32,
    elevation: 12,
  },
  recapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  aiGlowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderWidth: 1.5,
    borderColor: colors.accentOrange,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  glowIconText: {
    fontSize: 22,
    color: colors.accentOrange,
  },
  recapHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  recapHeaderSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.accentOrange,
    marginTop: 2,
  },
  recapBody: {
    marginBottom: 24,
  },
  focusTitleLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  focusTitleText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 16,
  },
  narrativeBox: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
  },
  narrativeHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  narrativeText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#CBD5E1',
    marginBottom: 12,
  },
  keyCluePill: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  keyClueText: {
    fontSize: 13,
    color: '#E0F2FE',
  },
  visionSensorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  sensorStatusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentEmerald,
    marginRight: 8,
  },
  sensorStatusText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  gestureHintText: {
    fontSize: 12,
    color: colors.accentGold,
    fontWeight: '600',
  },
  footerRow: {
    alignItems: 'flex-end',
  },
  resumeBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resumeBtnFocused: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    transform: [{scale: 1.08}],
  },
  resumeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
});
