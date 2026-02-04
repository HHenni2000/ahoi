# ahoi - Fortschritts-Tracker

Letzte Aktualisierung: 2026-02-04

---

## Gesamtübersicht

| Phase | Beschreibung | Status |
|-------|-------------|--------|
| Phase 1 | Lokales Scraping-Prototyping | ✅ ABGESCHLOSSEN |
| Phase 2 | Backend API Setup (VPS) | 🔄 95% - API läuft, Cron fehlt |
| Phase 3 | Expo Frontend | 🔄 50% - UI fertig, Backend-Integration fehlt |
| Phase 4 | Testing & Polish | ⏳ Ausstehend |

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

### 2.4 GitHub & Deployment
- [x] GitHub Repository erstellen (HHenni2000/ahoi)
- [x] .gitignore und README.md
- [x] Initial commit und push

### 2.5 VPS Deployment
- [x] VPS vorbereitet (Python 3.12.3)
- [x] Code auf VPS deployed (git clone)
- [x] Virtual Environment und Dependencies installiert
- [x] .env mit OPENAI_API_KEY konfiguriert
- [x] PM2 Process Manager eingerichtet (start.py)
- [x] API läuft und ist von außen erreichbar (http://72.60.80.95:8000)
- [x] Firewall konfiguriert (Port 8000 offen)
- [ ] Cron Jobs einrichten (scrape_all.py, cleanup.py)
- [ ] Erste Event-Quelle hinzufügen und testen
- [ ] Optional: Nginx Reverse Proxy für HTTPS

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

### VPS Deployment-Erkenntnisse (2026-02-04)
- **VPS Setup:** Python 3.12.3 bereits vorhanden (kein PPA nötig)
- **Process Manager:** PM2 statt Systemd - einfacher für bestehende PM2-Infrastruktur
- **PM2 Python-Problem:** PM2 kann Python-Binaries nicht direkt starten → Lösung: `start.py` Wrapper-Script
- **Port-Konflikt:** Alte Prozesse mit `fuser -k 8000/tcp` killen
- **Firewall:** UFW Port 8000 öffnen mit `ufw allow 8000/tcp`
- **API läuft:** http://72.60.80.95:8000/api/health erfolgreich von außen erreichbar
- **Nächste Schritte:** Cron Jobs für automatisches Scraping, erste Event-Quelle testen
