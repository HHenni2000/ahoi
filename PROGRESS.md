# ahoi - Fortschritts-Tracker

Letzte Aktualisierung: 2026-02-04

---

## Gesamtübersicht

| Phase | Beschreibung | Status |
|-------|-------------|--------|
| Phase 1 | Lokales Scraping-Prototyping | ABGESCHLOSSEN |
| Phase 2 | Backend API Setup (VPS) | IN ARBEIT |
| Phase 3 | Expo Frontend | IN ARBEIT |
| Phase 4 | Testing & Polish | Ausstehend |

---

## Phase 1: Lokales Scraping-Prototyping

### 1.1 Projekt-Setup
- [x] Ordnerstruktur erstellen
- [x] requirements.txt erstellen
- [x] .env.example erstellen
- [x] .gitignore erstellen
- [x] Python venv erstellen und Dependencies installieren
- [x] Playwright Browser setup (Chromium)

### 1.2 Navigation Discovery (navigator.py)
- [x] Basis-Struktur erstellen
- [x] Regex-basierte Link-Suche implementieren
- [x] LLM-Fallback implementieren
- [x] Mit echten URLs testen

### 1.3 LLM Extraction (extractor.py)
- [x] HTML zu Markdown Konvertierung
- [x] Structured Output Schema definieren
- [x] Extraction-Prompt (deutsch, familienfreundlich)
- [x] Verbesserter Prompt mit detaillierten Kategorisierungsregeln
- [x] Location-Extraktion verbessert (district-Feld, Hamburger Stadtteile)
- [x] Playwright-Support für JavaScript-Seiten (Kindaling etc.)
- [x] Mit echten URLs testen

### 1.4 Deduplication (deduplicator.py)
- [x] Hash-Generierung implementieren (MD5 aus title + date + location)
- [x] Duplikat-Erkennung (process_events mit seen_hashes)
- [x] String-Normalisierung für konsistentes Hashing

### 1.5 Lokales Testing
- [x] Test mit Quelle 1: Bücherhallen Hamburg (5 Events, regex navigation)
- [x] Test mit Quelle 2: Kindaling Hamburg (2 Events, Playwright)
- [x] Test mit Quelle 3: Kindertheater Wackelzahn (4 Events, LLM navigation)
- [x] Test mit Quelle 4: Museum für Kunst und Gewerbe (2 Events)
- [x] Test mit Quelle 5: Fundus Theater (1 Event, LLM navigation)
- [x] Test mit Quelle 6: Tierpark Hagenbeck (1 Event)
- [x] Erfolgsrate dokumentieren: **86% (6/7 Quellen erfolgreich)**
- [x] Token-Kosten messen: **~15.000 Tokens, ca. $0.0043 für 7 Quellen**

---

## Phase 2: Backend API Setup (VPS)

### 2.1 FastAPI Backend
- [x] FastAPI App erstellen (main.py)
- [x] SQLite Datenbank-Schema (database.py)
- [x] Pydantic Models für API
- [x] CRUD Endpoints für Events
- [x] CRUD Endpoints für Sources
- [x] Scraper-Integration

### 2.2 Scripts
- [x] scrape_all.py (für Cron)
- [x] cleanup.py (alte Events löschen)

### 2.3 Dokumentation
- [x] SETUP.md mit VPS-Deployment-Anleitung
- [x] requirements.txt aktualisiert (FastAPI, uvicorn)

### 2.4 Deployment (Deine Aufgaben)
- [ ] VPS vorbereiten (Python 3.11+, venv)
- [ ] Code auf VPS deployen
- [ ] .env mit OPENAI_API_KEY konfigurieren
- [ ] Systemd Service einrichten
- [ ] Cron Jobs einrichten
- [ ] Optional: Nginx Reverse Proxy

---

## Phase 3: Expo Frontend

### 3.1 Projekt-Setup
- [x] Expo App erstellen (tabs template)
- [x] TailwindCSS Konfiguration (tailwind.config.js)
- [x] Lucide Icons installieren
- [x] FlashList installieren
- [ ] ~~Firebase SDK installieren~~ (nicht mehr nötig)
- [x] TypeScript Types definieren (types/event.ts)
- [x] Farbschema definieren (constants/Colors.ts)

### 3.2 Screens
- [x] Feed Screen (index.tsx) mit Mock-Daten
- [x] Filter-Chips (Datum, Kategorie)
- [x] EventCard Komponente
- [x] Map Screen (Placeholder)
- [x] Sources Screen mit Mock-Daten
- [ ] API Client für Backend
- [ ] Events vom Backend laden
- [ ] Pull-to-refresh mit echten Daten

### 3.3 Ausstehend
- [ ] react-native-maps Integration
- [ ] Push Notifications (optional)

---

## Phase 4: Testing & Polish
(Wird nach Phase 3 ausgefüllt)

---

## Notizen & Erkenntnisse

### Architektur-Änderung (2026-02-04)
- **Ursprünglich geplant:** Firebase (Firestore + Cloud Functions)
- **Neue Architektur:** Eigener VPS mit FastAPI + SQLite
- **Grund:** Kostenersparnis, mehr Kontrolle, VPS bereits vorhanden

### Scraping-Erkenntnisse
- **Navigation Discovery**: Regex funktioniert für die meisten Seiten, LLM-Fallback für komplexere Navigation (z.B. Single-Page-Apps, Anchor-Links)
- **Event-Extraktion**: gpt-4o-mini liefert gute Ergebnisse, Kategorisierung ist meist korrekt
- **Token-Verbrauch**: ~1.500-3.500 Tokens pro Quelle, sehr kosteneffizient
- **Playwright**: Notwendig für JS-lastige Seiten (Kindaling), auch als Fallback bei SSL-Problemen
- **Problematische Seiten**: klick-kindermuseum.de hat defektes SSL (Server-Problem)

### JavaScript-Seiten (Playwright)
Folgende Domains benötigen Playwright für JavaScript-Rendering:
- `kindaling.de` - React-basierte Seite, lädt Events dynamisch
- `kinderzeit-bremen.de` - Weitere JS-lastige Seite

Playwright wird automatisch aktiviert wenn eine URL diese Domains enthält.
Kann auch manuell erzwungen werden via `use_playwright=True`.
