import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import type { Region } from 'react-native-maps';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchEvents, fetchIdeas } from '@/lib/api';
import { Event, Idea } from '@/types/event';

const HAMBURG_REGION: Region = {
  latitude: 53.5511,
  longitude: 9.9937,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

let MapViewComponent: typeof import('react-native-maps').default | null = null;
let MarkerComponent: typeof import('react-native-maps').Marker | null = null;
let mapsInitError: string | null = null;

try {
  const mapsModule = require('react-native-maps');
  MapViewComponent = mapsModule.default ?? mapsModule;
  MarkerComponent = mapsModule.Marker;
} catch (error) {
  mapsInitError = error instanceof Error ? error.message : 'Map-Modul nicht verfuegbar.';
}

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const overlayBackground =
    colorScheme === 'dark' ? 'rgba(18,18,18,0.75)' : 'rgba(255,255,255,0.75)';

  const [events, setEvents] = useState<Event[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadEvents = async () => {
      try {
        const [eventData, ideaData] = await Promise.all([fetchEvents(), fetchIdeas()]);
        if (isMounted) {
          setEvents(eventData);
          setIdeas(ideaData);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Events konnten nicht geladen werden.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadEvents();
    return () => {
      isMounted = false;
    };
  }, []);

  const eventsWithCoords = useMemo(
    () =>
      events.filter(
        (event) =>
          typeof event.location.lat === 'number' && typeof event.location.lng === 'number'
      ),
    [events]
  );

  const ideasWithCoords = useMemo(
    () =>
      ideas.filter(
        (idea) => typeof idea.location.lat === 'number' && typeof idea.location.lng === 'number'
      ),
    [ideas]
  );

  const initialRegion = useMemo<Region>(() => {
    const allLatLng = [
      ...eventsWithCoords.map((event) => ({
        lat: event.location.lat ?? HAMBURG_REGION.latitude,
        lng: event.location.lng ?? HAMBURG_REGION.longitude,
      })),
      ...ideasWithCoords.map((idea) => ({
        lat: idea.location.lat ?? HAMBURG_REGION.latitude,
        lng: idea.location.lng ?? HAMBURG_REGION.longitude,
      })),
    ];

    if (!allLatLng.length) {
      return HAMBURG_REGION;
    }

    const lats = allLatLng.map((entry) => entry.lat);
    const lngs = allLatLng.map((entry) => entry.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.05, maxLat - minLat + 0.05),
      longitudeDelta: Math.max(0.05, maxLng - minLng + 0.05),
    };
  }, [eventsWithCoords, ideasWithCoords]);

  if (!MapViewComponent || !MarkerComponent) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.fallback}>
          <MapPin size={48} color={colors.textSecondary} />
          <Text style={[styles.title, { color: colors.text }]}>
            Kartenansicht nicht verfuegbar
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Bitte installiere `react-native-maps` und erstelle einen neuen Dev-Client.
          </Text>
          {mapsInitError && (
            <Text style={[styles.note, { color: colors.textSecondary }]}>{mapsInitError}</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapViewComponent style={styles.map} initialRegion={initialRegion}>
        {eventsWithCoords.map((event) => (
          <MarkerComponent
            key={event.id}
            coordinate={{
              latitude: event.location.lat as number,
              longitude: event.location.lng as number,
            }}
            title={event.title}
            description={event.location.name}
            pinColor="#0087B1"
          />
        ))}
        {ideasWithCoords.map((idea) => (
          <MarkerComponent
            key={idea.id}
            coordinate={{
              latitude: idea.location.lat as number,
              longitude: idea.location.lng as number,
            }}
            title={`[Idee] ${idea.title}`}
            description={idea.location.name}
            pinColor="#2E8B57"
          />
        ))}
      </MapViewComponent>

      {loading && (
        <View style={[styles.overlay, { backgroundColor: overlayBackground }]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Events werden geladen...
          </Text>
        </View>
      )}

      {!loading && eventsWithCoords.length === 0 && ideasWithCoords.length === 0 && (
        <View style={[styles.overlay, { backgroundColor: overlayBackground }]}>
          <MapPin size={48} color={colors.textSecondary} />
          <Text style={[styles.title, { color: colors.text }]}>
            Keine Kartenpunkte
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Es fehlen Koordinaten fÃ¼r diese Events.
          </Text>
          {errorMessage && (
            <Text style={[styles.note, { color: colors.error }]}>{errorMessage}</Text>
          )}
        </View>
      )}

      {!loading && (eventsWithCoords.length > 0 || ideasWithCoords.length > 0) && (
        <View style={[styles.legend, { backgroundColor: overlayBackground, borderColor: colors.border }]}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#0087B1' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Termin</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#2E8B57' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Immer moeglich</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  note: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  legend: {
    position: 'absolute',
    left: 12,
    bottom: 24,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
