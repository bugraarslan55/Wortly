import { Image } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';
import { Colors } from '../constants/theme';

type AppIconProps = {
  name: string;
  size?: number;
  color?: string;
  label?: string;
  style?: StyleProp<ImageStyle>;
};

export function AppIcon({
  name,
  size = 20,
  color = Colors.primary,
  label,
  style,
}: AppIconProps) {
  return (
    <Image
      source={`sf:${name}`}
      accessibilityLabel={label}
      accessible={Boolean(label)}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={[{ width: size, height: size, tintColor: color }, style]}
      contentFit="contain"
    />
  );
}
