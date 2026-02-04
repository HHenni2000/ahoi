# ahoi - Projekt Summary

## Ziel
ahoi ist ein familienfreundlicher Event-Aggregator fuer Hamburg. Die App sammelt Veranstaltungen von externen Webseiten, extrahiert strukturierte Daten per LLM und stellt sie in einer mobilen Expo-App mit Feed, Filtern und Karte dar.

## Inhaltliche Features
- Smart Feed mit Filtern (Datum, Kategorie)
- Kartenansicht mit Event-Pins
- Quellenverwaltung (URLs hinzufuegen, manuell scrapen)
- Fokus auf familienfreundliche Events (ab 4 Jahren)

## Architektur
- Frontend: Expo/React Native App
- Backend: FastAPI (Python) auf eigenem VPS
- Datenbank: SQLite
- Scraping: Hybrid (Code + LLM), Playwright fuer JS-Seiten
- Geocoding: OpenStreetMap Nominatim (best-effort, gecached)

## Scraping Pipeline (Kurz)
1. Navigation Discovery
   - Regex-Scoring bevorzugt Spielplan/Termine
   - LLM-Fallback bei unklaren Links
2. Event Extraction
   - HTML -> Markdown
   - LLM extrahiert Events als JSON
   - Detail-Links werden priorisiert
3. Deduplication
   - Hash aus Titel + Datum + Ort
4. iFrame Support
   - iFrames werden eingebettet
   - Google Sheets werden als CSV/Table gelesen

## Backend API (Auszug)
- GET /api/events (Filter: region, category, from_date, to_date, is_indoor)
- GET /api/events/{id}
- GET /api/sources
- POST /api/sources
- POST /api/sources/{id}/scrape
- GET /api/health

## Frontend App
- Expo Router Tabs: Feed, Map, Sources
- API Client mit Mapping (snake_case -> camelCase)
- Pull-to-refresh in Feed und Sources
- Links oeffnen via Expo WebBrowser

## Deployment/Operations
- VPS mit Python 3.12, PM2 fuer Prozess-Management
- Cron geplant fuer scrape_all.py und cleanup.py
- .env fuer Secrets und Konfiguration

## Konfiguration (Beispiele)
- OPENAI_API_KEY
- DATABASE_PATH
- GEOCODING_ENABLED
- MAX_IFRAMES
- LOG_LEVEL / SCRAPER_DEBUG
- EXPO_PUBLIC_API_BASE_URL (Frontend)

## Aktueller Stand (Kurz)
- Backend laeuft live auf dem VPS
- Scraper unterstuetzt iFrames und Google Sheets
- Frontend ist mit Backend verbunden
- Map-View ist implementiert (react-native-maps), Dev-Client noetig

## Offene Punkte
- Cron Jobs fuer regelmaessiges Scraping
- Optional: HTTPS Reverse Proxy
- Optional: Push Notifications
- End-to-End Tests und QA
