import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Alert,
} from 'react-native';
import {
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
} from 'lucide-react-native';

import { Source } from '@/types/event';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// Mock data for demonstration
const MOCK_SOURCES: Source[] = [
  {
    id: '1',
    name: 'Buecherhallen Hamburg',
    inputUrl: 'https://www.buecherhallen.de/',
    targetUrl: 'https://www.buecherhallen.de/termine.html',
    isActive: true,
    status: 'active',
    lastScraped: new Date('2026-02-04T10:00:00'),
    strategy: 'weekly',
    region: 'hamburg',
  },
  {
    id: '2',
    name: 'Kindaling Hamburg',
    inputUrl: 'https://www.kindaling.de/hamburg',
    targetUrl: 'https://www.kindaling.de/veranstaltungen/hamburg',
    isActive: true,
    status: 'active',
    lastScraped: new Date('2026-02-04T10:05:00'),
    strategy: 'weekly',
    region: 'hamburg',
  },
  {
    id: '3',
    name: 'Tierpark Hagenbeck',
    inputUrl: 'https://www.hagenbeck.de/',
    targetUrl: 'https://www.hagenbeck.de/de/tierpark/veranstaltungen/',
    isActive: true,
    status: 'active',
    lastScraped: new Date('2026-02-04T10:10:00'),
    strategy: 'weekly',
    region: 'hamburg',
  },
  {
    id: '4',
    name: 'Klick Kindermuseum',
    inputUrl: 'https://www.klick-kindermuseum.de/',
    isActive: false,
    status: 'error',
    lastError: 'SSL-Verbindung fehlgeschlagen',
    strategy: 'weekly',
    region: 'hamburg',
  },
];

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
}

function SourceCard({ source, onScrape }: SourceCardProps) {
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
          style={[styles.scrapeButton, { backgroundColor: colors.tint }]}
          onPress={() => onScrape(source)}
        >
          <RefreshCw size={16} color="#FFFFFF" />
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

export default function SourcesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [newUrl, setNewUrl] = useState('');
  const [sources, setSources] = useState<Source[]>(MOCK_SOURCES);

  const handleAddSource = () => {
    if (!newUrl.trim()) {
      Alert.alert('Fehler', 'Bitte gib eine URL ein');
      return;
    }

    // TODO: Call Firebase function to add source
    Alert.alert(
      'Quelle hinzufuegen',
      `URL: ${newUrl}\n\nDiese Funktion ist noch nicht implementiert.`
    );
    setNewUrl('');
  };

  const handleScrape = (source: Source) => {
    // TODO: Call Firebase function to scrape source
    Alert.alert(
      'Scraping starten',
      `Quelle: ${source.name}\n\nDiese Funktion ist noch nicht implementiert.`
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
          <SourceCard source={item} onScrape={handleScrape} />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine Quellen vorhanden
            </Text>
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
});
