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
  { key: 'all', label: 'Indoor + Outdoor' },
  { key: 'indoor', label: 'Nur Indoor' },
  { key: 'outdoor', label: 'Nur Outdoor' },
];

export default function IdeasTabScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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
      if (showSpinner) {
        setLoading(true);
      }
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
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [categoryFilter, placeFilter]
  );

  useEffect(() => {
    loadIdeas(true);
  }, [loadIdeas]);

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
          borderColor: isSelected ? selectedColor || '#2E8B57' : colors.border,
          backgroundColor: isSelected ? selectedColor || '#2E8B57' : colors.background,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, { color: isSelected ? '#FFFFFF' : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
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
          <View style={styles.headerWrap}>
            <View
              style={[
                styles.hero,
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.heroTitle, { color: colors.text }]}>Ideen</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Orte und Aktivitaeten ohne festen Termin.
              </Text>
            </View>

            <View
              style={[
                styles.filterCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
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
                  {ideas.length} Treffer
                </Text>
                {hasCustomFilters && (
                  <Pressable
                    onPress={() => {
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
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Keine Ideen gefunden</Text>
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
