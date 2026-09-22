import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './app-icon';
import { BorderRadius, Colors, Spacing } from '../constants/theme';

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
        <AppIcon name={icon} size={23} color={focused ? Colors.primary : Colors.outline} />
      </View>
      <Text numberOfLines={1} style={[styles.tabLabel, focused && styles.tabLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

export default function MainTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={focused ? 'house.fill' : 'house'} label="Ana Sayfa" focused={focused} />
          ),
          tabBarAccessibilityLabel: 'Ana Sayfa',
        }}
      />
      <Tabs.Screen
        name="konular"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={focused ? 'rectangle.stack.fill' : 'rectangle.stack'} label="Konular" focused={focused} />
          ),
          tabBarAccessibilityLabel: 'Konular',
        }}
      />
      <Tabs.Screen
        name="kelimelerim"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={focused ? 'text.book.closed.fill' : 'text.book.closed'} label="Kelimelerim" focused={focused} />
          ),
          tabBarAccessibilityLabel: 'Kelimelerim',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopColor: Colors.outlineVariant,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 72,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
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
  iconContainerActive: { backgroundColor: Colors.secondaryContainer },
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
