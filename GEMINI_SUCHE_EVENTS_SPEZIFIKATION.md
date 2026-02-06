# Gemini Suche: Technische Spezifikation fuer ahhoi Events

## Ziel
Gemini soll ueber Google Search familienfreundliche Events fuer Hamburg finden und in einem JSON-Format zurueckgeben, das ohne Strukturbruch in die bestehende Event-Pipeline passt.

## Bestehende Zielstruktur im Projekt
Massgebliche Strukturen:
- `backend/main.py` -> `EventResponse` (API liefert `snake_case`)
- `app/lib/api.ts` -> `ApiEvent` und `toEvent(...)`
- `app/types/event.ts` -> `Event` (Frontend-intern `camelCase`)

Persistierte Event-Felder (Backend/DB/API):
- `id` (wird intern generiert)
- `source_id` (wird intern gesetzt)
- `title`
- `description`
- `date_start`
- `date_end`
- `location_name`
- `location_address`
- `location_district`
- `location_lat`
- `location_lng`
- `category`
- `is_indoor`
- `age_suitability`
- `price_info`
- `original_link`
- `region`

Wichtig:
- `id` und `source_id` sollen **nicht** von Gemini kommen.
- `id` wird im aktuellen System per Dedupe-Hash erzeugt (`title + date + location_name`).

## Gemini API: empfohlene Anbindung
### Auth
- API-Key in Backend-Env:
  - `GEMINI_API_KEY=...`
  - optional: `GEMINI_MODEL=gemini-3-flash-preview` (oder Projektstandard)

### Endpoint (REST)
- `POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent`
- Query-Parameter: `key=${GEMINI_API_KEY}`

### Empfehlung zur Modellwahl
- Wenn Search + strikt schema-valides JSON in **einem** Call benoetigt wird:
  - `gemini-3-flash-preview` (laut Google-Doku: Structured Output mit Tools fuer Gemini-3 Preview).
- Stabiler Fallback:
  - `gemini-2.5-flash` mit `google_search` und serverseitiger Validierung/Normalisierung nachgelagert.

## Request-Format an Gemini (Soll)
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Finde familienfreundliche Events in Hamburg fuer Kinder ab 4 Jahren in den naechsten 14 Tagen. Gib ausschliesslich JSON gemaess Schema zurueck."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {}
    }
  ],
  "generationConfig": {
    "temperature": 0.2,
    "responseMimeType": "application/json",
    "responseJsonSchema": {
      "type": "object",
      "properties": {
        "events": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "description": { "type": "string" },
              "date_start": { "type": "string" },
              "date_end": { "type": ["string", "null"] },
              "location_name": { "type": ["string", "null"] },
              "location_address": { "type": ["string", "null"] },
              "location_district": { "type": ["string", "null"] },
              "location_lat": { "type": ["number", "null"] },
              "location_lng": { "type": ["number", "null"] },
              "category": {
                "type": "string",
                "enum": ["theater", "outdoor", "museum", "music", "sport", "market", "kreativ", "lesen"]
              },
              "is_indoor": { "type": "boolean" },
              "age_suitability": { "type": ["string", "null"] },
              "price_info": { "type": ["string", "null"] },
              "original_link": { "type": ["string", "null"] },
              "region": { "type": "string" }
            },
            "required": ["title", "date_start", "category", "is_indoor", "region"]
          }
        }
      },
      "required": ["events"]
    }
  }
}
```

## Verbindliches Rueckgabeformat fuer die Integration
Die Integrationsschicht soll Gemini-Antworten in folgendes Normalformat bringen:

```json
{
  "events": [
    {
      "title": "Kinderkonzert Elbphilharmonie",
      "description": "Interaktives Familienkonzert mit Orchester.",
      "date_start": "2026-02-14T11:00:00+01:00",
      "date_end": "2026-02-14T12:00:00+01:00",
      "location_name": "Elbphilharmonie",
      "location_address": "Platz der Deutschen Einheit 4, 20457 Hamburg",
      "location_district": "HafenCity",
      "location_lat": 53.5413,
      "location_lng": 9.9841,
      "category": "music",
      "is_indoor": true,
      "age_suitability": "4+",
      "price_info": "ab 8 EUR",
      "original_link": "https://example.org/event/kinderkonzert",
      "region": "hamburg"
    }
  ]
}
```

## Feldregeln (damit es in die aktuelle Struktur passt)
1. `title`: Pflicht, nicht leer.
2. `date_start`: Pflicht, ISO-8601 (`YYYY-MM-DDTHH:mm:ss±HH:mm` oder `Z`).
3. `category`: Pflicht, nur diese Werte:
   - `theater`
   - `outdoor`
   - `museum`
   - `music`
   - `sport`
   - `market`
   - `kreativ`
   - `lesen`
4. `is_indoor`: Pflicht, echter Boolean.
5. `region`: Pflicht, fuer ahhoi aktuell Standard `hamburg`.
6. `date_end`: optional, sonst `null`.
7. `location_*`: optional, aber `location_name` sollte moeglichst gesetzt sein.
8. `original_link`: absolute URL; falls unbekannt `null`.
9. `age_suitability`/`price_info`: String oder `null` (kein Freitext-Muell).
10. Keine Werte wie `"Unbekannt"` erzwingen; lieber `null`, damit Backend sauber fallbacken kann.

## Mapping in bestehende App
Backend API (`snake_case`) wird im Frontend bereits gemappt:
- `date_start` -> `dateStart` (`Date`)
- `date_end` -> `dateEnd` (`Date | undefined`)
- `location_name` -> `location.name`
- `location_address` -> `location.address`
- `location_district` -> `location.district`
- `location_lat` -> `location.lat`
- `location_lng` -> `location.lng`
- `source_id` wird in Frontend zu `sourceId`

Das heisst: Wenn Gemini-Integration das obige `events[]`-Format liefert, passt es direkt in vorhandene DB/API/Frontend-Pfade.

## Serverseitige Validierung vor `upsert_event(...)`
Vor dem Speichern:
1. Pflichtfelder pruefen (`title`, `date_start`, `category`, `is_indoor`, `region`).
2. `date_start`/`date_end` strikt als ISO parsen.
3. `category` gegen Enum validieren, sonst auf `outdoor` normalisieren oder Event verwerfen.
4. `region` auf `hamburg` normalisieren, falls leer.
5. `original_link` validieren (http/https), sonst `null`.
6. Dedupe/ID wie bisher im Pipeline-Schritt erzeugen.

## Optionales Zusatz-Metadatenformat (nicht in DB speichern)
Falls Quellen/Nachvollziehbarkeit gebraucht werden:
```json
{
  "events": [],
  "meta": {
    "query": "familien events hamburg wochenende",
    "model": "gemini-3-flash-preview",
    "grounded": true,
    "source_urls": ["https://..."]
  }
}
```

`meta` ist optional und soll nicht in der bestehenden `events`-Tabelle persistiert werden.

## Minimaler Implementierungsablauf
1. Gemini Call mit `google_search` ausfuehren.
2. JSON in obiges Normalformat parsen.
3. Validieren/normalisieren.
4. In bestehendes Event-Dict fuer `db.upsert_event(...)` ueberfuehren.
5. Bestehende `/api/events` bleibt unveraendert konsumierbar.

## Offizielle Referenzen
- Gemini API Tools / Google Search: https://ai.google.dev/gemini-api/docs/google-search
- Structured Output (JSON Schema): https://ai.google.dev/gemini-api/docs/structured-output
- Grounding mit Google Search: https://ai.google.dev/gemini-api/docs/grounding
