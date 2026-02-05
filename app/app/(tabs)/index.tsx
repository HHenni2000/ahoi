import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { EventCard } from '@/components/EventCard';
import { Event, EventCategory } from '@/types/event';
import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchEvents } from '@/lib/api';

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
  { key: 'kreativ', label: 'Kreativ' },
  { key: 'lesen', label: 'Lesen' },
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

  if (filter === 'week') {
    const day = now.getDay();
    const daysUntilSunday = (7 - day) % 7;
    return { fromDate: startOfDay(now), toDate: endOfDay(addDays(now, daysUntilSunday)) };
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

export default function FeedScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all');

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
        });
        setEvents(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Events konnten nicht geladen werden.';
        setErrorMessage(message);
      } finally {
        setRefreshing(false);
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [categoryFilter, dateFilter]
  );

  useEffect(() => {
    loadEvents(true);
  }, [loadEvents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
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
        data={events}
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
            {loading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Keine Events gefunden
                </Text>
                {errorMessage && (
                  <Text style={[styles.errorText, { color: colors.error }]}>
                    {errorMessage}
                  </Text>
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
  errorText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});
