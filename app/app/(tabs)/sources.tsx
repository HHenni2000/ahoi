import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  View,
  Text,
  StyleSheet,
  TextInput,
} from 'react-native';
import {
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react-native';

import { Source } from '@/types/event';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { createSource, fetchSources, scrapeSource } from '@/lib/api';

const StatusIcon = ({ status }: { status: Source['status'] }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  switch (status) {
    case 'active':
      return <CheckCircle size={20} color={colors.success} />;
    case 'error':
      return <XCircle size={20} color={colors.error} />;
    case 'pending':
      return <Clock size={20} color={colors.warning} />;
  }
};

interface SourceCardProps {
  source: Source;
  onScrape: (source: Source) => void;
  isScraping: boolean;
}

function SourceCard({ source, onScrape, isScraping }: SourceCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const formatDate = (date?: Date) => {
    if (!date) return 'Nie';
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <View style={[styles.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sourceHeader}>
        <StatusIcon status={source.status} />
        <Text style={[styles.sourceName, { color: colors.text }]} numberOfLines={1}>
          {source.name}
        </Text>
        <Pressable
          style={[
            styles.scrapeButton,
            { backgroundColor: colors.tint },
            isScraping && { opacity: 0.7 },
          ]}
          onPress={() => onScrape(source)}
          disabled={isScraping}
        >
          {isScraping ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <RefreshCw size={16} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      <Text style={[styles.sourceUrl, { color: colors.textSecondary }]} numberOfLines={1}>
        {source.inputUrl}
      </Text>

      <View style={styles.sourceMeta}>
        <Text style={[styles.sourceMetaText, { color: colors.textSecondary }]}>
          Zuletzt: {formatDate(source.lastScraped)}
        </Text>
        <Text style={[styles.sourceMetaText, { color: colors.textSecondary }]}>
          {source.strategy === 'weekly' ? 'Woechentlich' : 'Monatlich'}
        </Text>
      </View>

      {source.status === 'error' && source.lastError && (
        <Text style={[styles.errorText, { color: colors.error }]}>
          Fehler: {source.lastError}
        </Text>
      )}
    </View>
  );
}

const normalizeUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
};

const guessNameFromUrl = (rawUrl: string) => {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
    const base = hostname.split('.')[0] ?? hostname;
    const cleaned = base.replace(/[-_]+/g, ' ').trim();
    return cleaned
      ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
      : hostname;
  } catch {
    return 'Neue Quelle';
  }
};

export default function SourcesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [newUrl, setNewUrl] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scrapingSourceId, setScrapingSourceId] = useState<string | null>(null);

  const loadSources = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    setErrorMessage(null);
    try {
      const data = await fetchSources();
      setSources(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Quellen konnten nicht geladen werden.';
      setErrorMessage(message);
    } finally {
      setRefreshing(false);
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadSources(true);
  }, [loadSources]);

  const handleAddSource = async () => {
    const normalizedUrl = normalizeUrl(newUrl);
    if (!normalizedUrl) {
      Alert.alert('Fehler', 'Bitte gib eine URL ein');
      return;
    }

    try {
      const name = guessNameFromUrl(normalizedUrl);
      await createSource({ name, inputUrl: normalizedUrl });
      setNewUrl('');
      await loadSources(true);
      Alert.alert('Quelle hinzugefuegt', `Quelle ${name} wurde gespeichert.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Quelle konnte nicht hinzugefuegt werden.';
      Alert.alert('Fehler', message);
    }
  };

  const handleScrape = async (source: Source) => {
    setScrapingSourceId(source.id);
    try {
      const result = await scrapeSource(source.id);
      await loadSources(true);
      Alert.alert(
        'Scraping abgeschlossen',
        `Gefunden: ${result.events_found}\nNeu: ${result.events_new}\nDauer: ${Math.round(
          result.duration_seconds
        )}s`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Scraping konnte nicht gestartet werden.';
      Alert.alert('Fehler', message);
    } finally {
      setScrapingSourceId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Add Source Input */}
      <View style={[styles.addSection, { borderBottomColor: colors.border }]}>
        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundSecondary,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="https://example.com"
            placeholderTextColor={colors.textSecondary}
            value={newUrl}
            onChangeText={setNewUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable
            style={[styles.addButton, { backgroundColor: colors.tint }]}
            onPress={handleAddSource}
          >
            <Plus size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Gib die URL einer Webseite mit Veranstaltungen ein
        </Text>
      </View>

      {/* Sources List */}
      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SourceCard
            source={item}
            onScrape={handleScrape}
            isScraping={scrapingSourceId === item.id}
          />
        )}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void loadSources();
        }}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Keine Quellen vorhanden
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  addSection: {
    padding: 16,
    borderBottomWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  sourceCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sourceName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  scrapeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceUrl: {
    fontSize: 13,
    marginBottom: 8,
  },
  sourceMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sourceMetaText: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
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
