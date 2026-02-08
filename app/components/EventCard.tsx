import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  Drama,
  TreePine,
  Landmark,
  Music,
  Medal,
  ShoppingBag,
  Palette,
  BookOpen,
  MapPin,
  Calendar,
  Users,
} from 'lucide-react-native';

import { Event, EventCategory } from '@/types/event';
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

interface EventCardProps {
  event: Event;
  showTypeBadge?: boolean;
}

export function EventCard({ event, showTypeBadge = true }: EventCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const Icon = CategoryIcon[event.category];
  const categoryColor = CategoryColors[event.category];
  const pastelColor = isDark
    ? CategoryPastelColorsDark[event.category]
    : CategoryPastelColors[event.category];

  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      date.getFullYear() === tomorrow.getFullYear() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getDate() === tomorrow.getDate();

    const time = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);

    if (isToday) return `Heute, ${time}`;
    if (isTomorrow) return `Morgen, ${time}`;

    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handlePress = async () => {
    if (!event.originalLink) return;
    const url = normalizeUrl(event.originalLink);
    if (!url) return;

    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
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
              {CategoryLabel[event.category]}
            </Text>
          </View>
          {event.isIndoor !== undefined && (
            <View style={styles.bannerTag}>
              <Text style={[styles.bannerTagText, { fontFamily: 'Nunito_600SemiBold' }]}>
                {event.isIndoor ? 'Indoor' : 'Outdoor'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Card body */}
      <View style={styles.body}>
        {/* Title */}
        <Text style={[styles.title, { color: colors.text, fontFamily: 'Nunito_700Bold' }]} numberOfLines={2}>
          {event.title}
        </Text>

        {/* Description */}
        {event.description ? (
          <Text style={[styles.description, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]} numberOfLines={2}>
            {event.description}
          </Text>
        ) : null}

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F0F2F5' }]} />

        {/* Meta rows */}
        <View style={styles.metaWrap}>
          <View style={styles.metaRow}>
            <Calendar size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
              {formatDate(event.dateStart)}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <MapPin size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]} numberOfLines={1}>
              {event.location.name}
              {event.location.district ? ` · ${event.location.district}` : ''}
            </Text>
          </View>
        </View>

        {/* Bottom row: age */}
        <View style={styles.bottomRow}>
          <View style={styles.ageRow}>
            <Users size={13} color={colors.textSecondary} />
            <Text style={[styles.ageText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
              {event.ageSuitability}
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
