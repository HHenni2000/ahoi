import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { EventCard } from '@/components/EventCard';
import { Event, EventCategory } from '@/types/event';
import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// Mock data for demonstration
const MOCK_EVENTS: Event[] = [
  {
    id: '1',
    sourceId: 'buecherhallen',
    title: 'Bilderbuchkino - jeden Mittwoch ein neues Abenteuer!',
    description: 'Spannende Geschichten auf der grossen Leinwand mit anschliessendem Basteln.',
    dateStart: new Date('2026-02-04T16:00:00'),
    location: { name: 'Buecherhalle Bramfeld', address: 'Herthastrasse 18', district: 'Bramfeld' },
    category: 'theater',
    isIndoor: true,
    ageSuitability: '4+',
    priceInfo: 'Kostenlos',
    originalLink: 'https://www.buecherhallen.de/',
    region: 'hamburg',
  },
  {
    id: '2',
    sourceId: 'hagenbeck',
    title: 'Ferienprogramm im Tierpark',
    description: 'Entdecke die Tierwelt hautnah mit unseren Tierpflegern.',
    dateStart: new Date('2026-02-15T10:00:00'),
    location: { name: 'Tierpark Hagenbeck', address: 'Lokstedter Grenzstrasse 2', district: 'Stellingen' },
    category: 'outdoor',
    isIndoor: false,
    ageSuitability: '4+',
    priceInfo: '15 EUR',
    originalLink: 'https://www.hagenbeck.de/',
    region: 'hamburg',
  },
  {
    id: '3',
    sourceId: 'mkg',
    title: 'Kunst erleben - Schritt fuer Schritt',
    description: 'Kinderfuehrung durch die aktuelle Ausstellung.',
    dateStart: new Date('2026-02-06T14:00:00'),
    location: { name: 'Museum fuer Kunst und Gewerbe', address: 'Steintorplatz', district: 'St. Georg' },
    category: 'museum',
    isIndoor: true,
    ageSuitability: '6+',
    priceInfo: 'Kostenlos',
    originalLink: 'https://www.mkg-hamburg.de/',
    region: 'hamburg',
  },
  {
    id: '4',
    sourceId: 'fundus',
    title: 'Die kleine Meerjungfrau',
    description: 'Bezauberndes Puppentheater nach Hans Christian Andersen.',
    dateStart: new Date('2026-02-15T15:00:00'),
    location: { name: 'Fundus Theater', address: 'Hasselbrookstrasse 25', district: 'Eilbek' },
    category: 'theater',
    isIndoor: true,
    ageSuitability: '4+',
    priceInfo: '8 EUR',
    originalLink: 'https://www.fundus-theater.de/',
    region: 'hamburg',
  },
];

type DateFilter = 'all' | 'today' | 'weekend' | 'week';

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'today', label: 'Heute' },
  { key: 'weekend', label: 'Wochenende' },
  { key: 'week', label: 'Diese Woche' },
];

const CATEGORY_FILTERS: { key: EventCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'theater', label: 'Theater' },
  { key: 'outdoor', label: 'Outdoor' },
  { key: 'museum', label: 'Museum' },
  { key: 'music', label: 'Musik' },
  { key: 'sport', label: 'Sport' },
  { key: 'market', label: 'Markt' },
];

export default function FeedScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all');

  // Filter events
  const filteredEvents = MOCK_EVENTS.filter((event) => {
    if (categoryFilter !== 'all' && event.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const onRefresh = async () => {
    setRefreshing(true);
    // TODO: Fetch events from Firebase
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const renderFilterChip = (
    key: string,
    label: string,
    isSelected: boolean,
    onPress: () => void,
    color?: string
  ) => (
    <Pressable
      key={key}
      style={[
        styles.filterChip,
        {
          backgroundColor: isSelected
            ? color || colors.tint
            : colors.backgroundSecondary,
          borderColor: isSelected ? color || colors.tint : colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: isSelected ? '#FFFFFF' : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Filter Section */}
      <View style={styles.filterSection}>
        {/* Date Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {DATE_FILTERS.map((filter) =>
            renderFilterChip(
              filter.key,
              filter.label,
              dateFilter === filter.key,
              () => setDateFilter(filter.key)
            )
          )}
        </ScrollView>

        {/* Category Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {CATEGORY_FILTERS.map((filter) =>
            renderFilterChip(
              filter.key,
              filter.label,
              categoryFilter === filter.key,
              () => setCategoryFilter(filter.key),
              filter.key !== 'all' ? CategoryColors[filter.key as EventCategory] : undefined
            )
          )}
        </ScrollView>
      </View>

      {/* Event List */}
      <FlashList
        data={filteredEvents}
        renderItem={({ item }) => <EventCard event={item} />}
        estimatedItemSize={200}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine Events gefunden
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterSection: {
    paddingVertical: 8,
    gap: 8,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
  },
});
