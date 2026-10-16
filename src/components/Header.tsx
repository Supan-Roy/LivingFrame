import React, {useState, useEffect} from 'react';
import {StyleSheet, Text, View, Image} from 'react-native';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';

export const Header = () => {
  const {roomState} = useRoom();
  const [timeString, setTimeString] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.headerContainer}>
      {/* Brand & Wordmark */}
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoIcon}>❖</Text>
        </View>
        <View style={styles.wordmarkContainer}>
          <Text style={styles.wordmarkTitle}>
            LIVING<Text style={styles.wordmarkAccent}>FRAME</Text>
          </Text>
          <Text style={styles.wordmarkSub}>RESPONSIVE TV EXPERIENCE</Text>
        </View>
      </View>

      {/* Center Ambient Room Sensor Pill */}
      <View style={styles.ambientPill}>
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

      {/* Right: Clock & Vega Badge */}
      <View style={styles.rightSection}>
        <Text style={styles.clockText}>{timeString}</Text>
        <Image
          source={require('../assets/vega.png')}
          style={styles.vegaBadge}
          resizeMode="contain"
          testID="header-vega-logo"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingTop: 16,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoIcon: {
    fontSize: 22,
    color: colors.primary,
    fontWeight: 'bold',
  },
  wordmarkContainer: {
    justifyContent: 'center',
  },
  wordmarkTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  wordmarkAccent: {
    color: colors.primary,
  },
  wordmarkSub: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginTop: -2,
  },
  ambientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sensorIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 9,
  },
  sensorActive: {
    backgroundColor: colors.accentEmerald,
  },
  sensorStandby: {
    backgroundColor: colors.accentGold,
  },
  ambientPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#E2E8F0',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clockText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 18,
  },
  vegaBadge: {
    width: 90,
    height: 36,
  },
});
