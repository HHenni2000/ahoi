import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, StyleSheet, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { MapPin } from 'lucide-react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchEvents } from '@/lib/api';
import { Event } from '@/types/event';

const HAMBURG_REGION: Region = {
  latitude: 53.5511,
  longitude: 9.9937,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const overlayBackground =
    colorScheme === 'dark' ? 'rgba(18,18,18,0.75)' : 'rgba(255,255,255,0.75)';

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadEvents = async () => {
      try {
        const data = await fetchEvents();
        if (isMounted) {
          setEvents(data);
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

  const initialRegion = useMemo<Region>(() => {
    if (!eventsWithCoords.length) {
      return HAMBURG_REGION;
    }

    const lats = eventsWithCoords.map((event) => event.location.lat ?? HAMBURG_REGION.latitude);
    const lngs = eventsWithCoords.map((event) => event.location.lng ?? HAMBURG_REGION.longitude);
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
  }, [eventsWithCoords]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        {eventsWithCoords.map((event) => (
          <Marker
            key={event.id}
            coordinate={{
              latitude: event.location.lat as number,
              longitude: event.location.lng as number,
            }}
            title={event.title}
            description={event.location.name}
          />
        ))}
      </MapView>

      {loading && (
        <View style={[styles.overlay, { backgroundColor: overlayBackground }]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Events werden geladen...
          </Text>
        </View>
      )}

      {!loading && eventsWithCoords.length === 0 && (
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
});
