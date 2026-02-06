import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { EventCard } from '@/components/EventCard';
import { IdeaCard } from '@/components/IdeaCard';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Event, Idea, NearbyReference } from '@/types/event';
import { fetchEvents, fetchIdeas, fetchNearbyReference } from '@/lib/api';

const HAMBURG_FALLBACK_REFERENCE: NearbyReference = {
  label: 'Hamburg (Fallback)',
  postalCode: '20095',
  lat: 53.5511,
  lng: 9.9937,
};

type NearbyMode = 'events' | 'ideas';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const addDays = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const getWeekendRange = () => {
  const now = new Date();
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
};

const toRad = (value: number) => (value * Math.PI) / 180;

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

export default function DiscoverScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nearbyMode, setNearbyMode] = useState<NearbyMode>('events');

  const [todayEvents, setTodayEvents] = useState<Event[]>([]);
  const [weekendEvents, setWeekendEvents] = useState<Event[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [nearbyReference, setNearbyReference] = useState<NearbyReference>(
    HAMBURG_FALLBACK_REFERENCE
  );

  const loadData = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        const now = new Date();
        const { fromDate: weekendFrom, toDate: weekendTo } = getWeekendRange();
        const in48Hours = addDays(now, 2);

        const [todayData, weekendData, ideasData] = await Promise.all([
          fetchEvents({
            fromDate: startOfDay(now).toISOString(),
            toDate: endOfDay(in48Hours).toISOString(),
            limit: 50,
          }),
          fetchEvents({
            fromDate: weekendFrom.toISOString(),
            toDate: weekendTo.toISOString(),
            limit: 50,
          }),
          fetchIdeas({ limit: 50 }),
        ]);

        setTodayEvents(todayData);
        setWeekendEvents(weekendData);
        setIdeas(ideasData);

        try {
          const reference = await fetchNearbyReference();
          setNearbyReference(reference);
        } catch (nearbyError) {
          console.warn('[Discover] Failed to load nearby reference, using fallback.', nearbyError);
          setNearbyReference(HAMBURG_FALLBACK_REFERENCE);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Entdecken-Daten konnten nicht geladen werden.';
        setErrorMessage(message);
      } finally {
        setRefreshing(false);
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const nearbyEvents = useMemo(() => {
    return todayEvents
      .filter(
        (event) =>
          typeof event.location.lat === 'number' && typeof event.location.lng === 'number'
      )
      .map((event) => ({
        item: event,
        distanceKm: haversineKm(
          nearbyReference.lat,
          nearbyReference.lng,
          event.location.lat as number,
          event.location.lng as number
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 8)
      .map((entry) => entry.item);
  }, [todayEvents, nearbyReference]);

  const nearbyIdeas = useMemo(() => {
    return ideas
      .filter(
        (idea) => typeof idea.location.lat === 'number' && typeof idea.location.lng === 'number'
      )
      .map((idea) => ({
        item: idea,
        distanceKm: haversineKm(
          nearbyReference.lat,
          nearbyReference.lng,
          idea.location.lat as number,
          idea.location.lng as number
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 8)
      .map((entry) => entry.item);
  }, [ideas, nearbyReference]);

  const renderSectionHeader = (
    title: string,
    actionLabel: string | null,
    onPressAction?: () => void
  ) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {actionLabel && onPressAction ? (
        <Pressable onPress={onPressAction}>
          <Text style={[styles.actionText, { color: colors.tint }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadData();
          }}
          tintColor={colors.tint}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>Was moechtest du entdecken?</Text>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          Termine und Ideen sind getrennt, damit nichts untergeht.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <>
          {renderSectionHeader('Heute fuer euch', 'Alle Termine', () => router.push('/(tabs)/termine'))}
          {todayEvents.slice(0, 4).map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
          {!todayEvents.length && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine kurzfristigen Termine gefunden.
            </Text>
          )}

          {renderSectionHeader('Ideen ohne Datum', 'Alle Ideen', () => router.push('/ideas'))}
          {ideas.slice(0, 4).map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
          {!ideas.length && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine Ideen gefunden.
            </Text>
          )}

          {renderSectionHeader(
            'Dieses Wochenende',
            'Zur Terminliste',
            () => router.push('/(tabs)/termine')
          )}
          {weekendEvents.slice(0, 4).map((event) => (
            <EventCard key={`weekend-${event.id}`} event={event} />
          ))}
          {!weekendEvents.length && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine Wochenendtermine gefunden.
            </Text>
          )}

          {renderSectionHeader('In eurer Naehe', null)}
          <Text style={[styles.referenceText, { color: colors.textSecondary }]}>
            Referenz: {nearbyReference.label}
          </Text>
          <View style={styles.nearbyToggleRow}>
            <Pressable
              style={[
                styles.toggleButton,
                {
                  backgroundColor:
                    nearbyMode === 'events' ? colors.tint : colors.backgroundSecondary,
                  borderColor: nearbyMode === 'events' ? colors.tint : colors.border,
                },
              ]}
              onPress={() => setNearbyMode('events')}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  { color: nearbyMode === 'events' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                Termine
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.toggleButton,
                {
                  backgroundColor:
                    nearbyMode === 'ideas' ? colors.tint : colors.backgroundSecondary,
                  borderColor: nearbyMode === 'ideas' ? colors.tint : colors.border,
                },
              ]}
              onPress={() => setNearbyMode('ideas')}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  { color: nearbyMode === 'ideas' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                Ideen
              </Text>
            </Pressable>
          </View>

          {nearbyMode === 'events'
            ? nearbyEvents.map((event) => <EventCard key={`near-${event.id}`} event={event} />)
            : nearbyIdeas.map((idea) => <IdeaCard key={`near-idea-${idea.id}`} idea={idea} />)}

          {nearbyMode === 'events' && !nearbyEvents.length && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine Termine mit Koordinaten in der Naehe gefunden.
            </Text>
          )}
          {nearbyMode === 'ideas' && !nearbyIdeas.length && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine Ideen mit Koordinaten in der Naehe gefunden.
            </Text>
          )}
        </>
      )}

      {errorMessage && <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
  },
  loadingWrap: {
    paddingTop: 80,
    alignItems: 'center',
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  nearbyToggleRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  toggleButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  referenceText: {
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    textAlign: 'center',
  },
});
