import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, Clock3, Euro, Landmark, MapPin, Medal, Music, Palette, ShoppingBag, TreePine, Drama } from 'lucide-react-native';

import { Idea, EventCategory } from '@/types/event';
import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const CategoryIcon: Record<EventCategory, React.ComponentType<any>> = {
  theater: Drama,
  outdoor: TreePine,
  museum: Landmark,
  music: Music,
  sport: Medal,
  market: ShoppingBag,
  kreativ: Palette,
  lesen: BookOpen,
};

const CategoryLabel: Record<EventCategory, string> = {
  theater: 'Theater',
  outdoor: 'Outdoor',
  museum: 'Museum',
  music: 'Musik',
  sport: 'Sport',
  market: 'Markt',
  kreativ: 'Kreativ',
  lesen: 'Lesen',
};

interface IdeaCardProps {
  idea: Idea;
}

export function IdeaCard({ idea }: IdeaCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const Icon = CategoryIcon[idea.category];

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const handlePress = async () => {
    if (!idea.originalLink) return;
    const url = normalizeUrl(idea.originalLink);
    if (!url) return;

    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert('Link konnte nicht geoeffnet werden', url);
      }
    }
  };

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
    >
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: '#2E8B57' }]}>
          <Text style={styles.badgeText}>Immer moeglich</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: CategoryColors[idea.category] }]}>
          <Icon size={14} color="#FFFFFF" />
          <Text style={styles.badgeText}>{CategoryLabel[idea.category]}</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {idea.title}
      </Text>

      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {idea.description}
      </Text>

      <View style={styles.metaRow}>
        <MapPin size={14} color={colors.textSecondary} />
        <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
          {idea.location.name}
          {idea.location.district ? ` (${idea.location.district})` : ''}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Euro size={14} color={colors.textSecondary} />
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>{idea.priceInfo}</Text>
      </View>

      <View style={styles.metaRow}>
        <Clock3 size={14} color={colors.textSecondary} />
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {idea.durationMinutes ? `${idea.durationMinutes} min` : 'Dauer flexibel'}
        </Text>
        <View style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[styles.tagText, { color: colors.textSecondary }]}>
            {idea.isIndoor ? 'Indoor' : 'Outdoor'}
          </Text>
        </View>
        <View style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[styles.tagText, { color: colors.textSecondary }]}>{idea.ageSuitability}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 13,
    flex: 1,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
