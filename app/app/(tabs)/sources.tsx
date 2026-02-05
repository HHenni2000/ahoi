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
  ChevronDown,
  ChevronUp,
  Eye,
  Trash2,
} from 'lucide-react-native';

import { Source, ScrapingMode } from '@/types/event';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { createSource, fetchSources, scrapeSource, updateSource, deleteSource } from '@/lib/api';

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
  onUpdate: (source: Source) => void;
  onDelete: (source: Source) => void;
  isScraping: boolean;
}

function SourceCard({ source, onScrape, onUpdate, onDelete, isScraping }: SourceCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [expanded, setExpanded] = useState(false);
  const [editingMode, setEditingMode] = useState<ScrapingMode>(source.scrapingMode);
  const [editingHints, setEditingHints] = useState(source.scrapingHints ?? '');
  const [saving, setSaving] = useState(false);

  const formatDate = (date?: Date) => {
    if (!date) return 'Nie';
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSource(source.id, {
        scrapingMode: editingMode,
        scrapingHints: editingHints || undefined,
      });
      onUpdate(source);
      setExpanded(false);
      Alert.alert('Gespeichert', 'Scraping-Einstellungen wurden aktualisiert');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Speichern';
      Alert.alert('Fehler', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sourceHeader}>
        <StatusIcon status={source.status} />
        <Text style={[styles.sourceName, { color: colors.text }]} numberOfLines={1}>
          {source.name}
        </Text>
        {source.scrapingMode === 'vision' && (
          <View style={[styles.visionBadge, { backgroundColor: colors.tint + '20' }]}>
            <Eye size={12} color={colors.tint} />
            <Text style={[styles.visionBadgeText, { color: colors.tint }]}>Erweitert</Text>
          </View>
        )}
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
        <Pressable
          style={[styles.deleteButton, { backgroundColor: colors.error }]}
          onPress={() => onDelete(source)}
        >
          <Trash2 size={16} color="#FFFFFF" />
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

      {/* Expandable Settings */}
      <Pressable
        style={styles.expandButton}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={[styles.expandButtonText, { color: colors.tint }]}>
          Scraping-Einstellungen
        </Text>
        {expanded ? (
          <ChevronUp size={16} color={colors.tint} />
        ) : (
          <ChevronDown size={16} color={colors.tint} />
        )}
      </Pressable>

      {expanded && (
        <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
          {/* Scraping Mode Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Modus:</Text>
            <View style={styles.modeToggle}>
              <Pressable
                style={[
                  styles.modeButton,
                  editingMode === 'html' && { backgroundColor: colors.tint },
                  editingMode !== 'html' && { backgroundColor: colors.backgroundSecondary },
                ]}
                onPress={() => setEditingMode('html')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    editingMode === 'html' ? { color: '#FFFFFF' } : { color: colors.text },
                  ]}
                >
                  Standard
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeButton,
                  editingMode === 'vision' && { backgroundColor: colors.tint },
                  editingMode !== 'vision' && { backgroundColor: colors.backgroundSecondary },
                ]}
                onPress={() => setEditingMode('vision')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    editingMode === 'vision' ? { color: '#FFFFFF' } : { color: colors.text },
                  ]}
                >
                  Erweitert
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Scraping Hints */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Hinweise (optional):</Text>
            <TextInput
              style={[
                styles.hintsInput,
                {
                  backgroundColor: colors.backgroundSecondary,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder="z.B. Events in Google Sheets iFrame"
              placeholderTextColor={colors.textSecondary}
              value={editingHints}
              onChangeText={setEditingHints}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Save Button */}
          <Pressable
            style={[
              styles.saveButton,
              { backgroundColor: colors.tint },
              saving && { opacity: 0.7 },
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Speichern</Text>
            )}
          </Pressable>
        </View>
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

  const handleDelete = async (source: Source) => {
    Alert.alert(
      'Quelle löschen',
      `Möchten Sie "${source.name}" wirklich löschen? Alle zugehörigen Events werden ebenfalls gelöscht.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSource(source.id);
              await loadSources(true);
              Alert.alert('Erfolg', 'Quelle wurde gelöscht');
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Quelle konnte nicht gelöscht werden.';
              Alert.alert('Fehler', message);
            }
          },
        },
      ]
    );
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
            onUpdate={() => void loadSources(true)}
            onDelete={handleDelete}
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
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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
  visionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  visionBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
    paddingVertical: 8,
  },
  expandButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  settingRow: {
    gap: 8,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  hintsInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
