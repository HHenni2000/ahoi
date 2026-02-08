import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Compass, Lightbulb, Map } from 'lucide-react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarLabelStyle: {
          fontFamily: 'Nunito_600SemiBold',
          fontSize: 11,
        },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          ...Platform.select({
            ios: {
              height: 80,
              paddingBottom: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.08,
              shadowRadius: 16,
            },
            android: {
              elevation: 12,
              height: 64,
              paddingBottom: 8,
            },
            default: {
              height: 60,
              paddingBottom: 8,
            },
          }),
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Entdecken',
          tabBarIcon: ({ color, size }) => (
            <Compass size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="termine"
        options={{
          title: 'Ideen',
          tabBarIcon: ({ color, size }) => (
            <Lightbulb size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Karte',
          tabBarIcon: ({ color, size }) => (
            <Map size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
