import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EventCard } from '@/components/EventCard';
import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchEvents } from '@/lib/api';
import { Event, EventCategory } from '@/types/event';

type DateFilter = 'all' | 'today' | 'tomorrow' | 'weekend' | 'week';
type PlaceFilter = 'all' | 'indoor' | 'outdoor';

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'today', label: 'Heute' },
  { key: 'tomorrow', label: 'Morgen' },
  { key: 'weekend', label: 'Wochenende' },
  { key: 'week', label: '7 Tage' },
];

const CATEGORY_FILTERS: { key: EventCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'theater', label: 'Theater' },
  { key: 'outdoor', label: 'Outdoor' },
  { key: 'museum', label: 'Museum' },
  { key: 'music', label: 'Musik' },
  { key: 'sport', label: 'Sport' },
  { key: 'market', label: 'Markt' },
  { key: 'kreativ', label: 'Kreativ' },
  { key: 'lesen', label: 'Lesen' },
];

const PLACE_FILTERS: { key: PlaceFilter; label: string }[] = [
  { key: 'all', label: 'Indoor + Outdoor' },
  { key: 'indoor', label: 'Nur Indoor' },
  { key: 'outdoor', label: 'Nur Outdoor' },
];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const addDays = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const getDateRange = (filter: DateFilter) => {
  const now = new Date();

  if (filter === 'today') {
    return { fromDate: startOfDay(now), toDate: endOfDay(now) };
  }

  if (filter === 'tomorrow') {
    const tomorrow = addDays(now, 1);
    return { fromDate: startOfDay(tomorrow), toDate: endOfDay(tomorrow) };
  }

  if (filter === 'week') {
    return { fromDate: startOfDay(now), toDate: endOfDay(addDays(now, 6)) };
  }

  if (filter === 'weekend') {
    const day = now.getDay();
    if (day === 0) {
      return { fromDate: startOfDay(addDays(now, -1)), toDate: endOfDay(now) };
    }
    if (day === 6) {
      return { fromDate: startOfDay(now), toDate: endOfDay(addDays(now, 1)) };
    }
    const daysUntilSaturday = (6 - day + 7) % 7;
    const saturday = addDays(now, daysUntilSaturday);
    return { fromDate: startOfDay(saturday), toDate: endOfDay(addDays(saturday, 1)) };
  }

  return { fromDate: undefined, toDate: undefined };
};

export default function DiscoverScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all');
  const [placeFilter, setPlaceFilter] = useState<PlaceFilter>('all');

  const hasCustomFilters = useMemo(
    () => dateFilter !== 'all' || categoryFilter !== 'all' || placeFilter !== 'all',
    [categoryFilter, dateFilter, placeFilter]
  );

  const loadEvents = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        const { fromDate, toDate } = getDateRange(dateFilter);
        const data = await fetchEvents({
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          fromDate: fromDate ? fromDate.toISOString() : undefined,
          toDate: toDate ? toDate.toISOString() : undefined,
          isIndoor:
            placeFilter === 'all' ? undefined : placeFilter === 'indoor',
        });
        setEvents(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Termine konnten nicht geladen werden.';
        setErrorMessage(message);
      } finally {
        setRefreshing(false);
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [categoryFilter, dateFilter, placeFilter]
  );

  useEffect(() => {
    loadEvents(true);
  }, [loadEvents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
  };

  const renderPill = (
    key: string,
    label: string,
    isSelected: boolean,
    onPress: () => void,
    selectedColor?: string
  ) => (
    <Pressable
      key={key}
      style={[
        styles.pill,
        {
          borderColor: isSelected ? selectedColor || colors.tint : colors.border,
          backgroundColor: isSelected ? selectedColor || colors.tint : colors.background,
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.pillText,
          { color: isSelected ? '#FFFFFF' : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const header = (
    <View style={styles.headerWrap}>
      <View style={[styles.hero, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>Entdecken</Text>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          Alle Termine mit schnellen Filtern in einer Liste.
        </Text>
      </View>

      <View style={[styles.filterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.filterBlock}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Wann</Text>
          <View style={styles.pillsWrap}>
            {DATE_FILTERS.map((filter) =>
              renderPill(
                filter.key,
                filter.label,
                dateFilter === filter.key,
                () => setDateFilter(filter.key)
              )
            )}
          </View>
        </View>

        <View style={styles.filterBlock}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Kategorie</Text>
          <View style={styles.pillsWrap}>
            {CATEGORY_FILTERS.map((filter) =>
              renderPill(
                filter.key,
                filter.label,
                categoryFilter === filter.key,
                () => setCategoryFilter(filter.key),
                filter.key !== 'all' ? CategoryColors[filter.key as EventCategory] : undefined
              )
            )}
          </View>
        </View>

        <View style={styles.filterBlock}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Ortstyp</Text>
          <View style={styles.pillsWrap}>
            {PLACE_FILTERS.map((filter) =>
              renderPill(
                filter.key,
                filter.label,
                placeFilter === filter.key,
                () => setPlaceFilter(filter.key)
              )
            )}
          </View>
        </View>

        <View style={[styles.resultRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.resultText, { color: colors.textSecondary }]}>
            {events.length} Treffer
          </Text>
          {hasCustomFilters && (
            <Pressable
              onPress={() => {
                setDateFilter('all');
                setCategoryFilter('all');
                setPlaceFilter('all');
              }}
              style={[styles.resetButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.resetButtonText, { color: colors.textSecondary }]}>Filter zuruecksetzen</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EventCard event={item} showTypeBadge={false} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Keine Termine gefunden</Text>
                {errorMessage && (
                  <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
                )}
              </>
            )}
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
  listContent: {
    paddingBottom: 20,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    marginBottom: 8,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  filterCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  filterBlock: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resultRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resetButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});
