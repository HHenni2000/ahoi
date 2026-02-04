import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.placeholder}>
        <MapPin size={64} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.text }]}>
          Kartenansicht
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Hier werden Events auf einer Karte angezeigt.
        </Text>
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          Erfordert react-native-maps Integration
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  note: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
