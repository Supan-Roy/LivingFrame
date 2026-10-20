import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme/theme';
import {useRoom} from '../context/RoomContext';
import {HEADER_TOGGLE_ID} from '../navigation/focusGrid';
import {Icon} from './Icon';

export const Header = () => {
  const {roomState, setGesturesEnabled, setFamilyMode} = useRoom();

  return (
    <View style={styles.headerContainer}>
      {/* Brand & Wordmark */}
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Icon name="brand" size={18} color={colors.primary} />
        </View>
        <View style={styles.wordmarkContainer}>
          <Text style={styles.wordmarkTitle} testID="header-brand-title">
            LIVING<Text style={styles.wordmarkAccent}>FRAME</Text>
          </Text>
          <Text style={styles.wordmarkSub}>RESPONSIVE TV EXPERIENCE</Text>
        </View>
      </View>

      {/* Universal switches (remote/touch only — never gesture-activated) */}
      <View style={styles.switchRow}>
        <Pressable
          style={[
            styles.gestureToggle,
            roomState.gesturesEnabled && styles.gestureToggleOn,
          ]}
          onPress={() => setGesturesEnabled(!roomState.gesturesEnabled)}
          accessibilityRole="button"
          accessibilityLabel={
            roomState.gesturesEnabled
              ? 'Turn off gesture control'
              : 'Turn on gesture control'
          }
          testID={HEADER_TOGGLE_ID}>
          <View style={styles.switchIcon}>
            <Icon
              name="camera"
              size={14}
              color={roomState.gesturesEnabled ? '#6EE7B7' : '#94A3B8'}
            />
          </View>
          <Text
            style={[
              styles.gestureToggleText,
              roomState.gesturesEnabled && styles.gestureToggleTextOn,
            ]}>
            {roomState.gesturesEnabled ? 'GESTURES ON' : 'GESTURES OFF'}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.gestureToggle,
            roomState.familyModeEnabled && styles.familyToggleOn,
          ]}
          onPress={() => setFamilyMode(!roomState.familyModeEnabled)}
          accessibilityRole="button"
          accessibilityLabel={
            roomState.familyModeEnabled
              ? 'Turn off Family Mode'
              : 'Turn on Family Mode'
          }
          testID="header-family-toggle">
          <View style={styles.switchIcon}>
            <Icon
              name="family"
              size={14}
              color={roomState.familyModeEnabled ? '#FDE68A' : '#94A3B8'}
            />
          </View>
          <Text
            style={[
              styles.gestureToggleText,
              roomState.familyModeEnabled && styles.familyToggleTextOn,
            ]}>
            {roomState.familyModeEnabled ? 'FAMILY ON' : 'FAMILY OFF'}
          </Text>
        </Pressable>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  switchIcon: {
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
  familyToggleOn: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.6)',
  },
  familyToggleTextOn: {
    color: '#FDE68A',
  },
});
