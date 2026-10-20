/* eslint-disable react-native/no-inline-styles --
 * Icon geometry is computed from `size`, so these styles must stay dynamic. */
import React from 'react';
import {View} from 'react-native';

export type IconName =
  | 'brand'
  | 'camera'
  | 'family'
  | 'person'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'forward'
  | 'restart'
  | 'spark'
  | 'info'
  | 'close'
  | 'chevron-left'
  | 'chevron-right';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/**
 * Minimal geometric icon set drawn with plain Views.
 *
 * Deliberately dependency-free (no icon fonts, no react-native-svg) so it renders on
 * Vega with the stock view primitives. Shapes are designed on a 16x16 grid and scaled.
 */
export const Icon = ({name, size = 16, color = '#FFFFFF'}: IconProps) => {
  const u = size / 16;
  const box = {width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const};

  switch (name) {
    case 'play':
      return (
        <View style={box}>
          <View
            style={{
              width: 0,
              height: 0,
              borderTopWidth: 5.5 * u,
              borderBottomWidth: 5.5 * u,
              borderLeftWidth: 9 * u,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: color,
              marginLeft: 2 * u,
            }}
          />
        </View>
      );

    case 'pause':
      return (
        <View style={[box, {flexDirection: 'row'}]}>
          <View
            style={{
              width: 3.4 * u,
              height: 11 * u,
              borderRadius: 1 * u,
              backgroundColor: color,
              marginRight: 3 * u,
            }}
          />
          <View
            style={{
              width: 3.4 * u,
              height: 11 * u,
              borderRadius: 1 * u,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case 'rewind':
    case 'forward': {
      const pointingLeft = name === 'rewind';
      return (
        <View style={[box, {flexDirection: 'row'}]}>
          {[0, 1].map(index => (
            <View
              key={index}
              style={{
                width: 0,
                height: 0,
                borderTopWidth: 4.5 * u,
                borderBottomWidth: 4.5 * u,
                ...(pointingLeft
                  ? {borderRightWidth: 6 * u, borderRightColor: color}
                  : {borderLeftWidth: 6 * u, borderLeftColor: color}),
                borderTopColor: 'transparent',
                borderBottomColor: 'transparent',
                marginLeft: index === 0 ? 0 : -2.5 * u,
              }}
            />
          ))}
        </View>
      );
    }

    case 'restart':
      return (
        <View style={box}>
          <View
            style={{
              width: 11.5 * u,
              height: 11.5 * u,
              borderRadius: 5.75 * u,
              borderWidth: 1.7 * u,
              borderColor: color,
              borderRightColor: 'transparent',
              transform: [{rotate: '-35deg'}],
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: 1.2 * u,
              top: 2.2 * u,
              width: 0,
              height: 0,
              borderTopWidth: 2.6 * u,
              borderBottomWidth: 2.6 * u,
              borderLeftWidth: 3.6 * u,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: color,
            }}
          />
        </View>
      );

    case 'camera':
      return (
        <View style={box}>
          <View
            style={{
              position: 'absolute',
              top: 1.8 * u,
              width: 6 * u,
              height: 2 * u,
              borderTopLeftRadius: 1 * u,
              borderTopRightRadius: 1 * u,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: 14 * u,
              height: 10 * u,
              marginTop: 3 * u,
              borderRadius: 2 * u,
              borderWidth: 1.5 * u,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                width: 4.4 * u,
                height: 4.4 * u,
                borderRadius: 2.2 * u,
                borderWidth: 1.5 * u,
                borderColor: color,
              }}
            />
          </View>
        </View>
      );

    case 'person':
      return (
        <View style={box}>
          <View
            style={{
              width: 5 * u,
              height: 5 * u,
              borderRadius: 2.5 * u,
              backgroundColor: color,
              marginBottom: 1.4 * u,
            }}
          />
          <View
            style={{
              width: 9 * u,
              height: 4.4 * u,
              borderTopLeftRadius: 4.4 * u,
              borderTopRightRadius: 4.4 * u,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case 'family':
      return (
        <View style={[box, {flexDirection: 'row', alignItems: 'flex-end'}]}>
          <View style={{alignItems: 'center', marginRight: -2 * u}}>
            <View
              style={{
                width: 5 * u,
                height: 5 * u,
                borderRadius: 2.5 * u,
                backgroundColor: color,
                marginBottom: 1.2 * u,
              }}
            />
            <View
              style={{
                width: 8.5 * u,
                height: 4.2 * u,
                borderTopLeftRadius: 4.2 * u,
                borderTopRightRadius: 4.2 * u,
                backgroundColor: color,
              }}
            />
          </View>
          <View style={{alignItems: 'center'}}>
            <View
              style={{
                width: 4 * u,
                height: 4 * u,
                borderRadius: 2 * u,
                backgroundColor: color,
                marginBottom: 1.2 * u,
              }}
            />
            <View
              style={{
                width: 6.8 * u,
                height: 3.6 * u,
                borderTopLeftRadius: 3.6 * u,
                borderTopRightRadius: 3.6 * u,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      );

    case 'brand':
      return (
        <View style={box}>
          <View
            style={{
              width: 8 * u,
              height: 8 * u,
              borderWidth: 1.6 * u,
              borderColor: color,
              borderRadius: 0.8 * u,
              transform: [{rotate: '45deg'}],
            }}
          />
        </View>
      );

    case 'spark':
      return (
        <View style={box}>
          <View
            style={{
              width: 6.6 * u,
              height: 6.6 * u,
              backgroundColor: color,
              borderRadius: 0.8 * u,
              transform: [{rotate: '45deg'}],
            }}
          />
        </View>
      );

    case 'info':
      return (
        <View style={box}>
          <View
            style={{
              width: 13.5 * u,
              height: 13.5 * u,
              borderRadius: 6.75 * u,
              borderWidth: 1.5 * u,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                width: 1.7 * u,
                height: 1.7 * u,
                borderRadius: 0.85 * u,
                backgroundColor: color,
                marginBottom: 0.9 * u,
              }}
            />
            <View
              style={{
                width: 1.7 * u,
                height: 4.4 * u,
                borderRadius: 0.85 * u,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      );

    case 'close':
      return (
        <View style={box}>
          <View
            style={{
              position: 'absolute',
              width: 11 * u,
              height: 1.7 * u,
              borderRadius: 1 * u,
              backgroundColor: color,
              transform: [{rotate: '45deg'}],
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 11 * u,
              height: 1.7 * u,
              borderRadius: 1 * u,
              backgroundColor: color,
              transform: [{rotate: '-45deg'}],
            }}
          />
        </View>
      );

    case 'chevron-left':
    case 'chevron-right': {
      const flip = name === 'chevron-right' ? -1 : 1;
      return (
        <View style={box}>
          <View
            style={{
              position: 'absolute',
              width: 7.5 * u,
              height: 1.7 * u,
              borderRadius: 1 * u,
              backgroundColor: color,
              transform: [{rotate: `${45 * flip}deg`}],
              top: 4.6 * u,
              left: 3.4 * u,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 7.5 * u,
              height: 1.7 * u,
              borderRadius: 1 * u,
              backgroundColor: color,
              transform: [{rotate: `${-45 * flip}deg`}],
              top: 8.8 * u,
              left: 3.4 * u,
            }}
          />
        </View>
      );
    }

    default:
      return <View style={box} />;
  }
};
