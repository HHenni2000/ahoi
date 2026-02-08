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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { IdeaCard } from '@/components/IdeaCard';
import { fetchIdeas } from '@/lib/api';
import { EventCategory, Idea } from '@/types/event';

type PlaceFilter = 'all' | 'indoor' | 'outdoor';

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

export default function IdeasTabScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all');
  const [placeFilter, setPlaceFilter] = useState<PlaceFilter>('all');

  const hasCustomFilters = useMemo(
    () => categoryFilter !== 'all' || placeFilter !== 'all',
    [categoryFilter, placeFilter]
  );

  const loadIdeas = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchIdeas({
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          isIndoor: placeFilter === 'all' ? undefined : placeFilter === 'indoor',
        });
        setIdeas(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Ideen konnten nicht geladen werden.';
        setErrorMessage(message);
      } finally {
        setRefreshing(false);
        if (showSpinner) setLoading(false);
      }
    },
    [categoryFilter, placeFilter]
  );

  useEffect(() => {
    loadIdeas(true);
  }, [loadIdeas]);

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
      style={[styles.chip, { backgroundColor: getChipColor(key, isSelected) }]}
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
          {ideas.length} Ideen
        </Text>
        {hasCustomFilters && (
          <Pressable
            onPress={() => {
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
      <Text style={[styles.greeting, { color: colors.text, fontFamily: 'Nunito_700Bold' }]}>
        Ideen fuer jederzeit
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
        Orte und Aktivitaeten ohne festen Termin
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={ideas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <IdeaCard idea={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadIdeas();
            }}
            tintColor={colors.tint}
          />
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
                  Keine Ideen gefunden
                </Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
                  Versuch einen anderen Filter oder komm spaeter wieder!
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
  greeting: {
    fontSize: 28,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 14,
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
