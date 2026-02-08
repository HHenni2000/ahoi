import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  BookOpen,
  Clock,
  Landmark,
  MapPin,
  Medal,
  Music,
  Palette,
  ShoppingBag,
  TreePine,
  Drama,
  Users,
} from 'lucide-react-native';

import { Idea, EventCategory } from '@/types/event';
import Colors, { CategoryColors, CategoryPastelColors, CategoryPastelColorsDark } from '@/constants/Colors';
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
  const isDark = colorScheme === 'dark';

  const Icon = CategoryIcon[idea.category];
  const categoryColor = CategoryColors[idea.category];
  const pastelColor = isDark
    ? CategoryPastelColorsDark[idea.category]
    : CategoryPastelColors[idea.category];

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
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
      style={[styles.card, { backgroundColor: pastelColor }]}
      onPress={handlePress}
    >
      {/* Colored banner header */}
      <View style={[styles.banner, { backgroundColor: categoryColor }]}>
        <View style={styles.bannerContent}>
          <View style={styles.bannerLeft}>
            <Icon size={20} color="#FFFFFF" />
            <Text style={[styles.bannerLabel, { fontFamily: 'Nunito_600SemiBold' }]}>
              {CategoryLabel[idea.category]}
            </Text>
          </View>
          <View style={styles.bannerTag}>
            <Text style={[styles.bannerTagText, { fontFamily: 'Nunito_600SemiBold' }]}>
              {idea.isIndoor ? 'Indoor' : 'Outdoor'}
            </Text>
          </View>
        </View>
      </View>

      {/* Card body */}
      <View style={styles.body}>
        {/* Title */}
        <Text style={[styles.title, { color: colors.text, fontFamily: 'Nunito_700Bold' }]} numberOfLines={2}>
          {idea.title}
        </Text>

        {/* Description */}
        <Text style={[styles.description, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]} numberOfLines={2}>
          {idea.description}
        </Text>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F0F2F5' }]} />

        {/* Meta rows */}
        <View style={styles.metaWrap}>
          <View style={styles.metaRow}>
            <MapPin size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]} numberOfLines={1}>
              {idea.location.name}
              {idea.location.district ? ` · ${idea.location.district}` : ''}
            </Text>
          </View>
          {idea.durationMinutes && (
            <View style={styles.metaRow}>
              <Clock size={14} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
                ca. {idea.durationMinutes} Minuten
              </Text>
            </View>
          )}
        </View>

        {/* Bottom row: age */}
        <View style={styles.bottomRow}>
          <View style={styles.ageRow}>
            <Users size={13} color={colors.textSecondary} />
            <Text style={[styles.ageText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
              {idea.ageSuitability}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerLabel: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  bannerTag: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  bannerTagText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  body: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  metaWrap: {
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ageText: {
    fontSize: 13,
  },
});
