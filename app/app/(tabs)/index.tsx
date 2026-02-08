import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  { key: 'all', label: 'Alle Orte' },
  { key: 'indoor', label: 'Indoor' },
  { key: 'outdoor', label: 'Outdoor' },
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

const formatToday = () => {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
};

export default function DiscoverScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
      if (showSpinner) setLoading(true);
      setErrorMessage(null);

      try {
        const { fromDate, toDate } = getDateRange(dateFilter);
        const data = await fetchEvents({
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          fromDate: fromDate ? fromDate.toISOString() : undefined,
          toDate: toDate ? toDate.toISOString() : undefined,
          isIndoor: placeFilter === 'all' ? undefined : placeFilter === 'indoor',
        });
        setEvents(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Termine konnten nicht geladen werden.';
        setErrorMessage(message);
      } finally {
        setRefreshing(false);
        if (showSpinner) setLoading(false);
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

  const getChipColor = (key: string, isSelected: boolean) => {
    if (!isSelected) return colors.backgroundSecondary;
    if (key in CategoryColors) return CategoryColors[key as EventCategory];
    return colors.tint;
  };

  const renderChip = (
    key: string,
    label: string,
    isSelected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      style={[
        styles.chip,
        { backgroundColor: getChipColor(key, isSelected) },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: isSelected ? '#FFFFFF' : colors.textSecondary,
            fontFamily: 'Nunito_600SemiBold',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const filterBar = (
    <View style={[styles.filterBar, { backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {DATE_FILTERS.map((f) =>
          renderChip(f.key, f.label, dateFilter === f.key, () => setDateFilter(f.key))
        )}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {CATEGORY_FILTERS.map((f) =>
          renderChip(f.key, f.label, categoryFilter === f.key, () => setCategoryFilter(f.key))
        )}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {PLACE_FILTERS.map((f) =>
          renderChip(f.key, f.label, placeFilter === f.key, () => setPlaceFilter(f.key))
        )}
      </ScrollView>
      <View style={styles.resultRow}>
        <Text style={[styles.resultText, { color: colors.textSecondary, fontFamily: 'Nunito_600SemiBold' }]}>
          {events.length} Termine
        </Text>
        {hasCustomFilters && (
          <Pressable
            onPress={() => {
              setDateFilter('all');
              setCategoryFilter('all');
              setPlaceFilter('all');
            }}
          >
            <Text style={[styles.resetText, { color: colors.tint, fontFamily: 'Nunito_600SemiBold' }]}>
              Zuruecksetzen
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const header = (
    <View style={[styles.greetingWrap, { paddingTop: insets.top + 12, backgroundColor: colors.background }]}>
      <View style={styles.greetingRow}>
        <View style={styles.greetingTextWrap}>
          <Text style={[styles.greeting, { color: colors.text, fontFamily: 'Nunito_700Bold' }]}>
            Moin! Was unternehmt{'\n'}ihr heute?
          </Text>
          <Text style={[styles.dateText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
            {formatToday()}
          </Text>
        </View>
        <Pressable
          style={[styles.settingsButton, { backgroundColor: colors.backgroundSecondary }]}
          onPress={() => router.push('/sources')}
        >
          <Settings size={20} color={colors.textSecondary} />
        </Pressable>
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
        ListHeaderComponent={
          <>
            {header}
            {filterBar}
          </>
        }
        stickyHeaderIndices={[0]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <>
                <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: 'Nunito_700Bold' }]}>
                  Nichts gefunden
                </Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
                  Hmm, gerade keine Termine. Versuch einen anderen Filter!
                </Text>
                {errorMessage && (
                  <Text style={[styles.errorText, { color: colors.error, fontFamily: 'Nunito_400Regular' }]}>
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
  listContent: {
    paddingBottom: Platform.OS === 'ios' ? 100 : 80,
  },
  greetingWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingTextWrap: {
    flex: 1,
  },
  greeting: {
    fontSize: 28,
    lineHeight: 36,
  },
  dateText: {
    fontSize: 14,
    marginTop: 4,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  filterBar: {
    paddingBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
  },
  divider: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  resultText: {
    fontSize: 13,
  },
  resetText: {
    fontSize: 13,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
