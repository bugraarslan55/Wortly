import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/theme';

type Props = {
  /** 0-1 arası oran; aralık dışı değerler sınırlandırılır. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  value: number;
  total: number;
};

/** Gerçek ilerlemeyi çizen halka (react-native-svg: iOS ve Android'de aynı). */
export function ProgressRing({ progress, size = 88, strokeWidth = 9, value, total }: Props) {
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Günlük hedef: ${total} kelimeden ${value} tanesi tamamlandı`}
      accessibilityValue={{ min: 0, max: total, now: Math.min(value, total) }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={Colors.surfaceContainer} strokeWidth={strokeWidth} fill="none"
        />
        {clamped > 0 && (
          <Circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={Colors.golden} strokeWidth={strokeWidth} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value} maxFontSizeMultiplier={1.2}>{value}</Text>
        <Text style={styles.total} maxFontSizeMultiplier={1.2}>/ {total}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 24, fontWeight: '700', color: Colors.primary, lineHeight: 28 },
  total: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: -2 },
});
