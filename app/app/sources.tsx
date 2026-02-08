import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react-native';

import Colors, { CategoryColors } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  createSource,
  discoverEventsWithGemini,
  deleteSource,
  fetchSourceById,
  fetchSources,
  scrapeSource,
  updateIdea,
  updateSource,
  type GeminiDiscoveryResult,
} from '@/lib/api';
import { EventCategory, ScrapingMode, Source, SourceType } from '@/types/event';

const CATEGORIES: EventCategory[] = [
  'theater',
  'outdoor',
  'museum',
  'music',
  'sport',
  'market',
  'kreativ',
  'lesen',
];

const GEMINI_DISCOVERY_QUERY =
  'familienfreundliche wanderbuehne zirkus puppentheater mobile theater gastspiel hamburg';

const normalizeUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return '';
  }
};

export default function SourcesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [sourceType, setSourceType] = useState<SourceType>('event');
  const [newSourceName, setNewSourceName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newHints, setNewHints] = useState('');
  const [newEventScrapingMode, setNewEventScrapingMode] = useState<ScrapingMode>('html');

  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDescription, setIdeaDescription] = useState('');
  const [ideaLocationName, setIdeaLocationName] = useState('');
  const [ideaLocationAddress, setIdeaLocationAddress] = useState('');
  const [ideaDistrict, setIdeaDistrict] = useState('');
  const [ideaCategory, setIdeaCategory] = useState<EventCategory>('outdoor');
  const [ideaAge, setIdeaAge] = useState('4+');
  const [ideaPrice, setIdeaPrice] = useState('Unbekannt');
  const [ideaDuration, setIdeaDuration] = useState('');
  const [ideaIndoor, setIdeaIndoor] = useState(false);

  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scrapingSourceId, setScrapingSourceId] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [lastGeminiRun, setLastGeminiRun] = useState<GeminiDiscoveryResult | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);

  const isIdeaFormValid = useMemo(
    () =>
      newSourceName.trim().length > 0 &&
      ideaTitle.trim().length > 0 &&
      ideaDescription.trim().length > 0 &&
      ideaLocationName.trim().length > 0 &&
      ideaLocationAddress.trim().length > 0,
    [newSourceName, ideaTitle, ideaDescription, ideaLocationName, ideaLocationAddress]
  );

  const loadSources = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    setErrorMessage(null);
    try {
      setSources(await fetchSources());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quellen konnten nicht geladen werden.';
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

  const resetForm = () => {
    setNewSourceName('');
    setNewUrl('');
    setNewHints('');
    setNewEventScrapingMode('html');
    setIdeaTitle('');
    setIdeaDescription('');
    setIdeaLocationName('');
    setIdeaLocationAddress('');
    setIdeaDistrict('');
    setIdeaCategory('outdoor');
    setIdeaAge('4+');
    setIdeaPrice('Unbekannt');
    setIdeaDuration('');
    setIdeaIndoor(false);
    setEditingSourceId(null);
    setEditingIdeaId(null);
  };

  const handleAddSource = async () => {
    setSaving(true);
    try {
      if (sourceType === 'event') {
        const normalizedUrl = normalizeUrl(newUrl);
        if (!normalizedUrl) {
          Alert.alert('Fehler', 'Bitte gib eine gueltige URL fuer die Terminquelle ein');
          return;
        }
        await createSource({
          name: newSourceName.trim() || 'Neue Terminquelle',
          inputUrl: normalizedUrl,
          sourceType: 'event',
          scrapingMode: newEventScrapingMode,
          scrapingHints: newHints.trim() || undefined,
        });
      } else {
        if (!isIdeaFormValid) {
          Alert.alert('Fehler', 'Bitte Pflichtfelder fuer die Ideenquelle ausfuellen');
          return;
        }
        const normalizedIdeaUrl = normalizeUrl(newUrl);
        if (editingIdeaId && editingSourceId) {
          await updateSource(editingSourceId, {
            name: newSourceName.trim(),
            inputUrl: normalizedIdeaUrl || undefined,
          });
          await updateIdea(editingIdeaId, {
            title: ideaTitle.trim(),
            description: ideaDescription.trim(),
            locationName: ideaLocationName.trim(),
            locationAddress: ideaLocationAddress.trim(),
            locationDistrict: ideaDistrict.trim() || undefined,
            category: ideaCategory,
            isIndoor: ideaIndoor,
            ageSuitability: ideaAge.trim() || '4+',
            priceInfo: ideaPrice.trim() || 'Unbekannt',
            durationMinutes: ideaDuration.trim() ? Number(ideaDuration.trim()) : undefined,
            originalLink: normalizedIdeaUrl || undefined,
          });
        } else {
          await createSource({
            name: newSourceName.trim(),
            inputUrl: normalizedIdeaUrl,
            sourceType: 'idea',
            idea: {
              title: ideaTitle.trim(),
              description: ideaDescription.trim(),
              locationName: ideaLocationName.trim(),
              locationAddress: ideaLocationAddress.trim(),
              locationDistrict: ideaDistrict.trim() || undefined,
              category: ideaCategory,
              isIndoor: ideaIndoor,
              ageSuitability: ideaAge.trim() || '4+',
              priceInfo: ideaPrice.trim() || 'Unbekannt',
              durationMinutes: ideaDuration.trim() ? Number(ideaDuration.trim()) : undefined,
              originalLink: normalizedIdeaUrl || undefined,
            },
          });
        }
      }

      resetForm();
      await loadSources(true);
      Alert.alert('Erfolg', 'Quelle wurde gespeichert');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quelle konnte nicht gespeichert werden.';
      Alert.alert('Fehler', message);
    } finally {
      setSaving(false);
    }
  };

  const handleScrape = async (source: Source) => {
    if (source.sourceType !== 'event') return;
    setScrapingSourceId(source.id);
    try {
      const result = await scrapeSource(source.id);
      await loadSources(true);
      Alert.alert('Scraping abgeschlossen', `Gefunden: ${result.events_found}, Neu: ${result.events_new}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scraping konnte nicht gestartet werden.';
      Alert.alert('Fehler', message);
    } finally {
      setScrapingSourceId(null);
    }
  };

  const handleGeminiDiscovery = async () => {
    setGeminiLoading(true);
    try {
      const result = await discoverEventsWithGemini({
        query: GEMINI_DISCOVERY_QUERY,
        region: 'hamburg',
        daysAhead: 14,
        limit: 30,
      });
      setLastGeminiRun(result);
      await loadSources(true);

      if (!result.success) {
        Alert.alert('Gemini Discovery', result.errorMessage ?? 'Gemini Discovery konnte nicht abgeschlossen werden.');
        return;
      }

      Alert.alert(
        'Gemini Discovery abgeschlossen',
        `Gefunden (Search): ${result.eventsFound}\nNormalisiert: ${result.eventsNormalized}\nNeu: ${result.eventsNew}\nGespeichert: ${result.eventsSaved}\nVerworfen gesamt: ${result.eventsDropped}`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Gemini Discovery konnte nicht gestartet werden.';
      Alert.alert('Fehler', message);
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleShowGeminiTracking = () => {
    if (!lastGeminiRun) {
      Alert.alert('Gemini Tracking', 'Noch kein Discovery-Lauf vorhanden.');
      return;
    }

    const topIssues = Object.entries(lastGeminiRun.issueSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => `- ${reason}: ${count}`)
      .join('\n');

    const topUrls = lastGeminiRun.groundingUrls
      .slice(0, 5)
      .map((url) => `- ${url}`)
      .join('\n');

    const message =
      `Stage 1 - Search\n` +
      `Raw Events: ${lastGeminiRun.stages.search.eventsFoundRaw}\n` +
      `Grounding URLs: ${lastGeminiRun.stages.search.groundingUrlCount}\n` +
      `Model: ${lastGeminiRun.stages.search.model}\n` +
      `Timeout/Retry: ${lastGeminiRun.stages.search.timeoutSeconds ?? '-'}s / ${lastGeminiRun.stages.search.retryCount ?? '-'}\n\n` +
      `Stage 2 - Normalisierung\n` +
      `Normalisiert: ${lastGeminiRun.stages.normalization.eventsNormalized}\n` +
      `Validation Drops: ${lastGeminiRun.stages.normalization.eventsDroppedValidation}\n` +
      `Issues: ${lastGeminiRun.stages.normalization.issuesCount}\n\n` +
      `Stage 3 - Persistenz\n` +
      `Gespeichert: ${lastGeminiRun.stages.persistence.eventsSaved}\n` +
      `Neu: ${lastGeminiRun.stages.persistence.eventsNew}\n` +
      `Bestehend: ${lastGeminiRun.stages.persistence.eventsExisting}\n` +
      `Persistenz Drops: ${lastGeminiRun.stages.persistence.eventsDroppedPersistence}\n` +
      `Geocoded: ${lastGeminiRun.stages.geocoding.eventsGeocoded}\n\n` +
      `${topIssues ? `Top Issues:\n${topIssues}\n\n` : ''}` +
      `${topUrls ? `Top Grounding URLs:\n${topUrls}` : ''}`;

    Alert.alert('Gemini Tracking (letzter Lauf)', message);
  };

  const handleDelete = (source: Source) => {
    Alert.alert('Quelle loeschen', `Soll "${source.name}" geloescht werden?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Loeschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSource(source.id);
            await loadSources(true);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Quelle konnte nicht geloescht werden.';
            Alert.alert('Fehler', message);
          }
        },
      },
    ]);
  };

  const handleEditIdea = async (source: Source) => {
    try {
      const detail = await fetchSourceById(source.id);
      if (!detail.idea) {
        Alert.alert('Hinweis', 'Keine Idee fuer diese Quelle gefunden.');
        return;
      }
      setSourceType('idea');
      setEditingSourceId(source.id);
      setEditingIdeaId(detail.idea.id);
      setNewSourceName(detail.source.name);
      setNewUrl(detail.source.inputUrl.startsWith('manual://') ? '' : detail.source.inputUrl);
      setIdeaTitle(detail.idea.title);
      setIdeaDescription(detail.idea.description);
      setIdeaLocationName(detail.idea.location.name);
      setIdeaLocationAddress(detail.idea.location.address);
      setIdeaDistrict(detail.idea.location.district ?? '');
      setIdeaCategory(detail.idea.category);
      setIdeaAge(detail.idea.ageSuitability);
      setIdeaPrice(detail.idea.priceInfo);
      setIdeaDuration(detail.idea.durationMinutes ? String(detail.idea.durationMinutes) : '');
      setIdeaIndoor(detail.idea.isIndoor);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Idee konnte nicht geladen werden.';
      Alert.alert('Fehler', message);
    }
  };

  const handleSetScrapingMode = async (source: Source, mode: ScrapingMode) => {
    if (source.sourceType !== 'event' || source.scrapingMode === mode) return;
    try {
      await updateSource(source.id, { scrapingMode: mode });
      await loadSources(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scraping-Modus konnte nicht gespeichert werden.';
      Alert.alert('Fehler', message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
        <View style={[styles.discoveryCard, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[styles.discoveryTitle, { color: colors.text, fontFamily: 'Nunito_700Bold' }]}>
            Gemini Discovery
          </Text>
          <Text style={[styles.discoveryHint, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
            Wanderbuehnen, Zirkus und Puppentheater in Hamburg (14 Tage).
          </Text>
          <Pressable
            style={[styles.discoveryButton, { backgroundColor: colors.tint }, geminiLoading && { opacity: 0.7 }]}
            disabled={geminiLoading}
            onPress={() => void handleGeminiDiscovery()}
          >
            {geminiLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.discoveryButtonText, { fontFamily: 'Nunito_700Bold' }]}>Discovery starten</Text>
            )}
          </Pressable>
          {lastGeminiRun && (
            <View style={[styles.trackingCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.trackingTitle, { color: colors.text, fontFamily: 'Nunito_600SemiBold' }]}>
                Letzter Lauf
              </Text>
              <Text style={[styles.trackingLine, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
                Search: {lastGeminiRun.stages.search.eventsFoundRaw} raw, {lastGeminiRun.stages.search.groundingUrlCount} Quellen
              </Text>
              <Text style={[styles.trackingLine, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
                Normalisiert: {lastGeminiRun.stages.normalization.eventsNormalized}, Verworfen: {lastGeminiRun.stages.normalization.eventsDroppedValidation}
              </Text>
              <Text style={[styles.trackingLine, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
                Gespeichert: {lastGeminiRun.stages.persistence.eventsSaved}, Neu: {lastGeminiRun.stages.persistence.eventsNew}
              </Text>
              <Pressable
                style={[styles.trackingButton, { backgroundColor: colors.backgroundSecondary }]}
                onPress={handleShowGeminiTracking}
              >
                <Text style={[styles.trackingButtonText, { color: colors.text, fontFamily: 'Nunito_600SemiBold' }]}>
                  Details anzeigen
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.toggleButton,
              { backgroundColor: sourceType === 'event' ? colors.tint : colors.backgroundSecondary },
            ]}
            onPress={() => setSourceType('event')}
          >
            <Text style={[styles.toggleText, { fontFamily: 'Nunito_600SemiBold' }]}>Terminquelle</Text>
          </Pressable>
          <Pressable
            style={[
              styles.toggleButton,
              { backgroundColor: sourceType === 'idea' ? CategoryColors.outdoor : colors.backgroundSecondary },
            ]}
            onPress={() => setSourceType('idea')}
          >
            <Text style={[styles.toggleText, { fontFamily: 'Nunito_600SemiBold' }]}>Ideenquelle</Text>
          </Pressable>
        </View>

        <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Quellenname" placeholderTextColor={colors.textSecondary} value={newSourceName} onChangeText={setNewSourceName} />
        <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder={sourceType === 'event' ? 'URL (Pflicht)' : 'URL (optional)'} placeholderTextColor={colors.textSecondary} value={newUrl} onChangeText={setNewUrl} autoCapitalize="none" />

        {sourceType === 'event' ? (
          <>
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleButton, { backgroundColor: newEventScrapingMode === 'html' ? colors.tint : colors.backgroundSecondary }]}
                onPress={() => setNewEventScrapingMode('html')}
              >
                <Text style={[styles.toggleText, { fontFamily: 'Nunito_600SemiBold' }]}>Standard (HTML)</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleButton, { backgroundColor: newEventScrapingMode === 'vision' ? colors.tint : colors.backgroundSecondary }]}
                onPress={() => setNewEventScrapingMode('vision')}
              >
                <Text style={[styles.toggleText, { fontFamily: 'Nunito_600SemiBold' }]}>Erweitert (Vision)</Text>
              </Pressable>
            </View>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Scraping-Hinweise (optional)" placeholderTextColor={colors.textSecondary} value={newHints} onChangeText={setNewHints} />
          </>
        ) : (
          <>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Ideen-Titel" placeholderTextColor={colors.textSecondary} value={ideaTitle} onChangeText={setIdeaTitle} />
            <TextInput style={[styles.input, styles.multiline, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Beschreibung" placeholderTextColor={colors.textSecondary} value={ideaDescription} onChangeText={setIdeaDescription} multiline />
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Ort (Name)" placeholderTextColor={colors.textSecondary} value={ideaLocationName} onChangeText={setIdeaLocationName} />
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Adresse" placeholderTextColor={colors.textSecondary} value={ideaLocationAddress} onChangeText={setIdeaLocationAddress} />
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Stadtteil (optional)" placeholderTextColor={colors.textSecondary} value={ideaDistrict} onChangeText={setIdeaDistrict} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {CATEGORIES.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.chip, { backgroundColor: item === ideaCategory ? CategoryColors[item] : colors.backgroundSecondary }]}
                  onPress={() => setIdeaCategory(item)}
                >
                  <Text style={[styles.chipText, { fontFamily: 'Nunito_600SemiBold' }]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Alter (z.B. 4+)" placeholderTextColor={colors.textSecondary} value={ideaAge} onChangeText={setIdeaAge} />
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Preisinfo" placeholderTextColor={colors.textSecondary} value={ideaPrice} onChangeText={setIdeaPrice} />
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontFamily: 'Nunito_400Regular' }]} placeholder="Dauer in Minuten (optional)" placeholderTextColor={colors.textSecondary} value={ideaDuration} onChangeText={setIdeaDuration} keyboardType="number-pad" />

            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleButton, { backgroundColor: ideaIndoor ? colors.tint : colors.backgroundSecondary }]}
                onPress={() => setIdeaIndoor(true)}
              >
                <Text style={[styles.toggleText, { fontFamily: 'Nunito_600SemiBold' }]}>Indoor</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleButton, { backgroundColor: !ideaIndoor ? CategoryColors.outdoor : colors.backgroundSecondary }]}
                onPress={() => setIdeaIndoor(false)}
              >
                <Text style={[styles.toggleText, { fontFamily: 'Nunito_600SemiBold' }]}>Outdoor</Text>
              </Pressable>
            </View>
          </>
        )}

        <Pressable
          style={[
            styles.addButton,
            { backgroundColor: sourceType === 'event' ? colors.tint : CategoryColors.outdoor },
            saving && { opacity: 0.7 },
          ]}
          disabled={saving || (sourceType === 'idea' && !isIdeaFormValid)}
          onPress={handleAddSource}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Plus size={16} color="#FFFFFF" />
              <Text style={[styles.addButtonText, { fontFamily: 'Nunito_700Bold' }]}>
                {editingIdeaId ? 'Aktualisieren' : 'Speichern'}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void loadSources();
        }}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.rowCard, { backgroundColor: colors.card }]}>
            <View style={styles.rowTop}>
              <Text style={[styles.rowTitle, { color: colors.text, fontFamily: 'Nunito_700Bold' }]}>{item.name}</Text>
              <View style={[styles.badge, { backgroundColor: item.sourceType === 'event' ? colors.tint + '20' : CategoryColors.outdoor + '20' }]}>
                <Text style={[styles.badgeText, { color: item.sourceType === 'event' ? colors.tint : CategoryColors.outdoor, fontFamily: 'Nunito_600SemiBold' }]}>
                  {item.sourceType === 'event' ? 'Termin' : 'Idee'}
                </Text>
              </View>
            </View>
            <Text style={[styles.rowUrl, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]} numberOfLines={1}>
              {item.inputUrl}
            </Text>
            {item.sourceType === 'event' && (
              <View style={styles.modeRow}>
                <Text style={[styles.modeText, { color: colors.textSecondary, fontFamily: 'Nunito_400Regular' }]}>
                  {item.scrapingMode === 'vision' ? 'Vision' : 'HTML'}
                </Text>
                <View style={styles.modeToggleCompact}>
                  <Pressable
                    style={[styles.modeCompactButton, { backgroundColor: item.scrapingMode === 'html' ? colors.tint : colors.backgroundSecondary }]}
                    onPress={() => void handleSetScrapingMode(item, 'html')}
                  >
                    <Text style={[styles.modeCompactText, { fontFamily: 'Nunito_600SemiBold' }]}>HTML</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeCompactButton, { backgroundColor: item.scrapingMode === 'vision' ? colors.tint : colors.backgroundSecondary }]}
                    onPress={() => void handleSetScrapingMode(item, 'vision')}
                  >
                    <Text style={[styles.modeCompactText, { fontFamily: 'Nunito_600SemiBold' }]}>Vision</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <View style={styles.rowActions}>
              {item.sourceType === 'event' && (
                <Pressable
                  style={[styles.actionButton, { backgroundColor: colors.tint }]}
                  onPress={() => handleScrape(item)}
                >
                  {scrapingSourceId === item.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <RefreshCw size={14} color="#FFFFFF" />
                  )}
                </Pressable>
              )}
              {item.sourceType === 'idea' && (
                <Pressable
                  style={[styles.actionButton, { backgroundColor: CategoryColors.outdoor }]}
                  onPress={() => void handleEditIdea(item)}
                >
                  <Pencil size={14} color="#FFFFFF" />
                </Pressable>
              )}
              <Pressable style={[styles.actionButton, { backgroundColor: colors.error }]} onPress={() => handleDelete(item)}>
                <Trash2 size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.tint} />
            ) : (
              <>
                <Text style={[styles.emptyText, { color: colors.textSecondary, fontFamily: 'Nunito_600SemiBold' }]}>
                  Keine Quellen vorhanden
                </Text>
                {errorMessage ? (
                  <Text style={[styles.errorText, { color: colors.error, fontFamily: 'Nunito_400Regular' }]}>
                    {errorMessage}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  formScroll: { maxHeight: '50%' },
  formContent: { padding: 16, gap: 10 },
  discoveryCard: { borderRadius: 16, padding: 14, gap: 10 },
  discoveryTitle: { fontSize: 15 },
  discoveryHint: { fontSize: 13, lineHeight: 18 },
  discoveryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoveryButtonText: { color: '#FFFFFF', fontSize: 14 },
  trackingCard: { borderRadius: 12, padding: 10, gap: 4 },
  trackingTitle: { fontSize: 13 },
  trackingLine: { fontSize: 12, lineHeight: 16 },
  trackingButton: {
    marginTop: 6,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  trackingButtonText: { fontSize: 12 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleButton: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, flex: 1, alignItems: 'center' },
  toggleText: { color: '#FFFFFF', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chipScroll: { flexGrow: 0 },
  chip: { borderRadius: 14, paddingVertical: 7, paddingHorizontal: 12, marginRight: 8 },
  chipText: { color: '#FFFFFF', fontSize: 12 },
  addButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 14 },
  list: { flex: 1 },
  rowCard: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontSize: 14 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11 },
  rowUrl: { marginTop: 6, fontSize: 12 },
  modeRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  modeText: { fontSize: 12, flex: 1 },
  modeToggleCompact: { flexDirection: 'row', gap: 6 },
  modeCompactButton: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  modeCompactText: { color: '#FFFFFF', fontSize: 11 },
  rowActions: { marginTop: 10, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 70 },
  emptyText: { fontSize: 16 },
  errorText: { marginTop: 6, fontSize: 12 },
});
