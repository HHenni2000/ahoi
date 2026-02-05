# Plan: Kategorisierung verbessern — Aktivität statt Veranstaltungsort

## Kernproblem

Die aktuelle Regel "Ort ist entscheidend" funktioniert nur für Einzweck-Venues (Theater → immer Theater). Bei Mehrzweck-Venues wie **Bücherhalle** wird alles fälschlich als "museum" kategorisiert, obwohl die Aktivitäten sehr unterschiedlich sind (Malen, Vorlesen, Basteln, etc.).

## Lösung: Immer nach Aktivität kategorisieren

**Prinzip:** Kategorisiere nach dem, **was die Familie tatsächlich tun wird** — nicht nach dem Gebäude. Bei Theatern stimmt die Aktivität ohnehin mit dem Venue überein. Bei Bücherhallen/Kulturzentren variiert sie pro Event.

## Neue Kategorien

Aktuelle 6: `theater`, `outdoor`, `museum`, `music`, `sport`, `market`

**+2 neue Kategorien:**

| Kategorie | Beschreibung | Beispiele | Icon | Farbe |
|-----------|-------------|-----------|------|-------|
| `kreativ` | Kreative Aktivitäten, Basteln, Malen | Malnachmittag, Bastelworkshop, Töpfern, DIY | `Palette` (lucide) | `#FF6B6B` (Coral) |
| `lesen` | Lesen, Vorlesen, Buchevents | Vorlesestunde, Bilderbuchkino, Buchclub | `BookOpen` (lucide) | `#45B7D1` (Teal) |

## Geänderte LLM-Prompt-Regeln

**Alte Priorisierung (entfernen):**
```
- Wenn ein Museum einen Workshop anbietet → "museum" (Ort ist entscheidend)
```

**Neue Priorisierung:**
```
KATEGORISIERUNGS-REGEL:
- Kategorisiere IMMER nach der HAUPTAKTIVITÄT des Events, NICHT nach dem Veranstaltungsort
- Ein Malnachmittag in einer Bücherhalle → "kreativ" (Aktivität = Malen)
- Eine Vorlesestunde in einer Bücherhalle → "lesen" (Aktivität = Vorlesen)
- Eine Theateraufführung im Theater → "theater" (Aktivität = Theater)
- Eine Ausstellung im Museum → "museum" (Aktivität = Ausstellung besichtigen)
- Wenn ein Theater auch Musik hat → "theater" (Hauptattraktion)
- Zirkus mit Aufführung → "theater", Zirkusworkshop zum Mitmachen → "sport"
- Kinder-Flohmarkt → "market", nicht "outdoor" auch wenn draußen
```

## Zu ändernde Dateien (9 Stellen)

### Backend (3 Dateien)

1. **`backend/scraper/models.py`** (Zeile 13-20)
   - `KREATIV = "kreativ"` und `LESEN = "lesen"` zum `EventCategory` Enum hinzufügen

2. **`backend/scraper/extractor.py`** (Zeilen 45-100)
   - `EXTRACTION_SYSTEM_PROMPT`: Neue Kategorien + aktivitätsbasierte Regel
   - `ENRICHMENT_SYSTEM_PROMPT`: Neue Kategorien hinzufügen
   - `ENRICHMENT_USER_PROMPT`: `kreativ|lesen` zu den erlaubten Werten hinzufügen

3. **`backend/scraper/vision_scraper.py`** (Zeilen 37-43)
   - Kategorie-Liste und -Beschreibungen im Vision-Prompt aktualisieren

### Frontend (4 Dateien)

4. **`app/types/event.ts`** (Zeile 3)
   - `'kreativ' | 'lesen'` zum `EventCategory` Type hinzufügen

5. **`app/constants/Colors.ts`** (Zeilen 7-14)
   - Farben für `kreativ` und `lesen` hinzufügen

6. **`app/components/EventCard.tsx`** (Zeilen 20-38)
   - `Palette`, `BookOpen` Icons importieren
   - `CategoryIcon` und `CategoryLabel` Mappings erweitern

7. **`app/app/(tabs)/index.tsx`** (Zeilen 28-36)
   - Filter-Chips für `kreativ` ("Kreativ") und `lesen` ("Lesen") hinzufügen

8. **`app/lib/api.ts`** (Zeilen 70-77)
   - `'kreativ'` und `'lesen'` zum `validCategories` Array hinzufügen

### Bestehende Daten

9. **Events-Tabelle leeren + neu scrapen**
   - Einfachste Lösung: `DELETE FROM events;` dann alle Sources neu scrapen
   - Die Deduplizierung verhindert, dass bestehende Events neue Kategorien bekommen (Hash basiert auf Titel+Datum+Ort, nicht Kategorie)
   - Da nur Events der nächsten 14 Tage relevant sind, kein echter Datenverlust

## Reihenfolge

1. Backend: models.py → extractor.py → vision_scraper.py
2. Frontend: event.ts → Colors.ts → EventCard.tsx → index.tsx → api.ts
3. Deploy, Events leeren, neu scrapen
