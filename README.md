# ahoi 🌊

Familienfreundlicher Event-Aggregator für Hamburg mit KI-basiertem Web-Scraping.

## Projekt-Übersicht

**ahoi** scrapt automatisch Events von verschiedenen Hamburger Kultur- und Freizeitwebsites und stellt sie in einer benutzerfreundlichen Expo-App dar. Die Events werden mit LLMs (OpenAI) extrahiert und nach Familienfreundlichkeit gefiltert.

### Features

- **Intelligentes Scraping**: LLM-basierte Navigation und Event-Extraktion
- **Automatische Kategorisierung**: Theater, Outdoor, Museum, Musik, Sport, Märkte
- **Duplikatserkennung**: Hash-basierte Deduplizierung
- **REST API**: FastAPI Backend mit SQLite
- **Mobile App**: Expo/React Native App mit Filter und Map-View

## Architektur

```
/backend          → FastAPI + SQLite (auf VPS gehostet)
  /scraper        → Web-Scraping Pipeline
  main.py         → API Server
  database.py     → SQLite Operations
  scrape_all.py   → Cron Script

/app              → Expo/React Native App
  /app/(tabs)     → Screens (Feed, Map, Sources)
  /components     → UI Components
```

## Setup

### Backend

Siehe [backend/SETUP.md](backend/SETUP.md) für detaillierte Anleitung.

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# .env editieren und OPENAI_API_KEY eintragen

python main.py
```

API läuft dann auf: http://localhost:8000

### Frontend (Expo App)

```bash
cd app
npm install
npx expo start
```

## Dokumentation

- [IMPLEMENTATION.md](IMPLEMENTATION.md) - Architektur und Phasenplan
- [PROGRESS.md](PROGRESS.md) - Fortschritts-Tracker
- [backend/SETUP.md](backend/SETUP.md) - Backend Setup und Deployment

## Tech Stack

**Backend:**
- Python 3.11+
- FastAPI
- SQLite
- OpenAI API (gpt-4o-mini)
- Playwright (für JS-Seiten)

**Frontend:**
- Expo / React Native
- TypeScript
- NativeWind (Tailwind)
- Lucide Icons

## Erfolgsrate

Aktuell: **86%** (6/7 Quellen erfolgreich gescrapt)

Token-Kosten: ~$0.0043 für 7 Quellen (~15.000 Tokens)

## Lizenz

Privates Projekt
