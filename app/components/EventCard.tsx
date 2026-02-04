import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import {
  Drama,
  TreePine,
  Landmark,
  Music,
  Medal,
  ShoppingBag,
  MapPin,
  Clock,
  Euro,
} from 'lucide-react-native';

import { Event, EventCategory } from '@/types/event';
import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// Category icon mapping
const CategoryIcon: Record<EventCategory, React.ComponentType<any>> = {
  theater: Drama,
  outdoor: TreePine,
  museum: Landmark,
  music: Music,
  sport: Medal,
  market: ShoppingBag,
};

// Category labels in German
const CategoryLabel: Record<EventCategory, string> = {
  theater: 'Theater',
  outdoor: 'Outdoor',
  museum: 'Museum',
  music: 'Musik',
  sport: 'Sport',
  market: 'Markt',
};

interface EventCardProps {
  event: Event;
}

export function EventCard({ event }: EventCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const Icon = CategoryIcon[event.category];
  const categoryColor = CategoryColors[event.category];

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const handlePress = () => {
    if (event.originalLink) {
      Linking.openURL(event.originalLink);
    }
  };

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
    >
      {/* Category Badge */}
      <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
        <Icon size={14} color="#FFFFFF" />
        <Text style={styles.categoryText}>{CategoryLabel[event.category]}</Text>
      </View>

      {/* Title */}
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {event.title}
      </Text>

      {/* Description */}
      {event.description && (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {event.description}
        </Text>
      )}

      {/* Meta Info */}
      <View style={styles.metaContainer}>
        {/* Date */}
        <View style={styles.metaRow}>
          <Clock size={14} color={colors.textSecondary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {formatDate(event.dateStart)}
          </Text>
        </View>

        {/* Location */}
        <View style={styles.metaRow}>
          <MapPin size={14} color={colors.textSecondary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
            {event.location.name}
            {event.location.district && ` (${event.location.district})`}
          </Text>
        </View>

        {/* Price & Indoor/Outdoor */}
        <View style={styles.metaRow}>
          <Euro size={14} color={colors.textSecondary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {event.priceInfo}
          </Text>
          <View style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.tagText, { color: colors.textSecondary }]}>
              {event.isIndoor ? 'Indoor' : 'Outdoor'}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.tagText, { color: colors.textSecondary }]}>
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
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 8,
  },
  categoryText: {
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
  metaContainer: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
