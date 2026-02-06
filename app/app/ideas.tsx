import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Idea, EventCategory } from '@/types/event';
import { fetchIdeas } from '@/lib/api';
import { IdeaCard } from '@/components/IdeaCard';

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

export default function IdeasScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all');

  const loadIdeas = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      }
      setErrorMessage(null);
      try {
        const data = await fetchIdeas({
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
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
    [categoryFilter]
  );

  useEffect(() => {
    loadIdeas(true);
  }, [loadIdeas]);

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
          backgroundColor: isSelected ? color || colors.tint : colors.backgroundSecondary,
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

      <FlatList
        data={ideas}
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
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Keine Ideen gefunden
                </Text>
                {errorMessage && (
                  <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
                )}
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
