import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';
import {useNavFocus} from '../navigation/NavFocusContext';
import {HEADER_TOGGLE_ID} from '../navigation/focusGrid';

export const Header = () => {
  const {roomState, sendVisionCommand} = useRoom();
  const navFocus = useNavFocus();

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

      {/* Universal gesture-control switch (starts/stops the real webcam sensor) */}
      <Pressable
        ref={navFocus?.registerRef(HEADER_TOGGLE_ID)}
        style={[
          styles.gestureToggle,
          roomState.visionEnabled && styles.gestureToggleOn,
        ]}
        onFocus={() => navFocus?.reportFocus({row: 0, col: 0})}
        onPress={() => sendVisionCommand(!roomState.visionEnabled)}
        accessibilityRole="button"
        accessibilityLabel={
          roomState.visionEnabled
            ? 'Turn off gesture control'
            : 'Turn on gesture control'
        }
        testID={HEADER_TOGGLE_ID}>
        <Text style={styles.gestureToggleIcon}>🎥</Text>
        <Text
          style={[
            styles.gestureToggleText,
            roomState.visionEnabled && styles.gestureToggleTextOn,
          ]}>
          {roomState.visionEnabled ? 'GESTURES ON' : 'GESTURES OFF'}
        </Text>
      </Pressable>
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
  gestureToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  gestureToggleOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: 'rgba(16, 185, 129, 0.6)',
  },
  gestureToggleIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  gestureToggleText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gestureToggleTextOn: {
    color: '#6EE7B7',
  },
});
