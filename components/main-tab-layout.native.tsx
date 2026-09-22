import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { BorderRadius, Colors, Spacing } from '../constants/theme';
import HomeScreen from '../app/(tabs)/index';
import KonularScreen from '../app/(tabs)/konular';
import KelimelerimScreen from '../app/(tabs)/kelimelerim';
import { AppIcon } from './app-icon';

// Pager secildiginde pathname de guncellenir. Bu sirada uc ekranin birden
// yeniden render edilmesini engelleyerek native kaydirmanin akici kalmasini sagla.
const MemoizedHomeScreen = memo(HomeScreen);
const MemoizedKonularScreen = memo(KonularScreen);
const MemoizedKelimelerimScreen = memo(KelimelerimScreen);

const TABS = [
  { href: '/', label: 'Ana Sayfa', icon: 'house', activeIcon: 'house.fill' },
  { href: '/konular', label: 'Konular', icon: 'rectangle.stack', activeIcon: 'rectangle.stack.fill' },
  { href: '/kelimelerim', label: 'Kelimelerim', icon: 'text.book.closed', activeIcon: 'text.book.closed.fill' },
] as const;

function getIndexForPath(pathname: string) {
  if (pathname === '/konular') return 1;
  if (pathname === '/kelimelerim') return 2;
  return 0;
}

function TabIcon({
  icon,
  activeIcon,
  label,
  focused,
}: {
  icon: string;
  activeIcon: string;
  label: string;
  focused: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <View style={styles.tabItem}>
      <Animated.View
        style={[
          styles.iconContainer,
          {
            backgroundColor: focused ? Colors.secondaryContainer : 'transparent',
            transform: [{ scale: focused || reduceMotion ? 1 : 0.92 }],
            transitionProperty: ['backgroundColor', 'transform'],
            transitionDuration: 100,
            transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
          },
        ]}
      >
        <AppIcon
          name={focused ? activeIcon : icon}
          size={23}
          color={focused ? Colors.primary : Colors.outline}
        />
      </Animated.View>
      <Text
        numberOfLines={1}
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function MainTabLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const pagerRef = useRef<PagerView>(null);
  const lastPathnameRef = useRef(pathname);
  const pathIndex = getIndexForPath(pathname);
  const [activeIndex, setActiveIndex] = useState(pathIndex);

  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    setActiveIndex((currentIndex) =>
      currentIndex === pathIndex ? currentIndex : pathIndex
    );
    if (reduceMotion) {
      pagerRef.current?.setPageWithoutAnimation(pathIndex);
    } else {
      pagerRef.current?.setPage(pathIndex);
    }
  }, [pathname, pathIndex, reduceMotion]);

  const selectPage = (index: number) => {
    if (index === activeIndex) return;
    pagerRef.current?.setPageWithoutAnimation(index);
  };

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={pathIndex}
        offscreenPageLimit={1}
        overdrag
        onPageSelected={({ nativeEvent }) => {
          const nextIndex = nativeEvent.position;
          setActiveIndex((currentIndex) =>
            currentIndex === nextIndex ? currentIndex : nextIndex
          );
        }}
      >
        <View key="home" style={styles.page} collapsable={false}>
          <MemoizedHomeScreen />
        </View>
        <View key="topics" style={styles.page} collapsable={false}>
          <MemoizedKonularScreen />
        </View>
        <View key="words" style={styles.page} collapsable={false}>
          <MemoizedKelimelerimScreen />
        </View>
      </PagerView>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
        {TABS.map((tab, index) => {
          const focused = activeIndex === index;
          return (
            <Pressable
              key={tab.href}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
              onPress={() => selectPage(index)}
              style={styles.tabButton}
            >
              <TabIcon
                icon={tab.icon}
                activeIcon={tab.activeIcon}
                label={tab.label}
                focused={focused}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.warmWhite },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabBar: {
    minHeight: 64,
    paddingTop: Spacing.sm,
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopColor: Colors.outlineVariant,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabItem: {
    minWidth: 96,
    minHeight: Spacing.touchTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconContainer: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  tabLabel: {
    width: 96,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '500',
    color: Colors.outline,
    textAlign: 'center',
  },
  tabLabelActive: { color: Colors.primary, fontWeight: '700' },
});
