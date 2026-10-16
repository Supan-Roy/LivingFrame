import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';

export const Header = () => {
  const {roomState} = useRoom();

  return (
    <View style={styles.headerContainer}>
      {/* Brand & Wordmark */}
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoIcon}>❖</Text>
        </View>
        <View style={styles.wordmarkContainer}>
          <Text style={styles.wordmarkTitle} testID="header-brand-title">
            LIVING<Text style={styles.wordmarkAccent}>FRAME</Text>
          </Text>
          <Text style={styles.wordmarkSub}>RESPONSIVE TV EXPERIENCE</Text>
        </View>
      </View>

      {/* Right: Ambient Room Sensor Status Pill */}
      <View style={styles.ambientPill} testID="header-room-pill">
        <View
          style={[
            styles.sensorIndicatorDot,
            roomState.sensorStatus === 'active'
              ? styles.sensorActive
              : styles.sensorStandby,
          ]}
        />
        <Text style={styles.ambientPillText}>
          ROOM SENSOR ACTIVE • {roomState.viewersPresent} VIEWERS
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingTop: 10,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoIcon: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: 'bold',
  },
  wordmarkContainer: {
    justifyContent: 'center',
  },
  wordmarkTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  wordmarkAccent: {
    color: colors.primary,
  },
  wordmarkSub: {
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginTop: -2,
  },
  ambientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sensorIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  sensorActive: {
    backgroundColor: colors.accentEmerald,
  },
  sensorStandby: {
    backgroundColor: colors.accentGold,
  },
  ambientPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#E2E8F0',
  },
});
