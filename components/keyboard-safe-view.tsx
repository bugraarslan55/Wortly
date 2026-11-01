import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, LayoutChangeEvent, Platform, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Klavye açıldığında alttaki içeriğin (ör. sabit Kaydet düğmesi) görünür kalmasını sağlar.
 *
 * iOS: standart KeyboardAvoidingView (padding).
 * Android: edge-to-edge'de pencerenin klavyeyle yeniden boyutlanıp boyutlanmadığı cihaza/sürüme
 * göre değişir. Bu yüzden kapsayıcının yüksekliği izlenir: pencere küçüldüyse ek boşluk
 * eklenmez (çift boşluk olmaz); küçülmediyse klavye yüksekliği kadar alt boşluk eklenir.
 */
export function KeyboardSafeView({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [height, setHeight] = useState(0);
  const fullHeight = useRef(0);
  const keyboardOpen = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardOpen.current = true;
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpen.current = false;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS !== 'android') {
    return (
      <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior="padding">
        {children}
      </KeyboardAvoidingView>
    );
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    // Klavye kapalıyken ölçülen yükseklik "tam" yüksekliktir (ör. döndürme sonrası güncellenir).
    if (!keyboardOpen.current) fullHeight.current = next;
    setHeight(next);
  };

  const windowResized = fullHeight.current > 0 && height < fullHeight.current - 1;
  const padding = keyboardHeight > 0 && !windowResized ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  return (
    <View style={[{ flex: 1, paddingBottom: padding }, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}
