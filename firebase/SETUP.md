# Firebase Setup Guide

## Prerequisites

1. Node.js 18+ installed
2. Firebase CLI: `npm install -g firebase-tools`
3. Google Cloud account with billing enabled

## Initial Setup

### 1. Login to Firebase
```bash
firebase login
```

### 2. Create Firebase Project
```bash
firebase projects:create ahoi-hamburg --display-name "ahoi Hamburg"
```

Or create via [Firebase Console](https://console.firebase.google.com/)

### 3. Initialize Firebase in this directory
```bash
cd firebase
firebase use ahoi-hamburg
```

### 4. Enable Firestore
```bash
firebase firestore:databases:create --location=europe-west3
```

### 5. Configure Secrets
```bash
# OpenAI API Key
firebase functions:secrets:set OPENAI_API_KEY
```

### 6. Deploy
```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore

# Deploy Cloud Functions
firebase deploy --only functions
```

## Local Development

### Start Emulators
```bash
firebase emulators:start
```

This starts:
- Functions emulator: http://localhost:5001
- Firestore emulator: http://localhost:8080
- Emulator UI: http://localhost:4000

### Test Functions Locally
```bash
# Add a source
curl -X POST http://localhost:5001/ahoi-hamburg/europe-west3/add_source \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Theater", "inputUrl": "https://example.com"}'

# Scrape a source
curl -X POST http://localhost:5001/ahoi-hamburg/europe-west3/scrape_source \
  -H "Content-Type: application/json" \
  -d '{"sourceId": "abc123"}'
```

## Cloud Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `add_source` | HTTP POST | Add new source, discover calendar URL |
| `scrape_source` | HTTP POST | Scrape single source by ID |
| `scrape_all_weekly` | Schedule (Sun 2 AM) | Scrape all active weekly sources |
| `cleanup_old_events` | Schedule (Daily 6 AM) | Remove events older than 7 days |

## Firestore Collections

### `sources`
- `id`: Document ID
- `name`: Display name
- `inputUrl`: User-provided URL
- `targetUrl`: Discovered calendar URL
- `isActive`: Boolean
- `status`: "active" | "error" | "pending"
- `lastScraped`: Timestamp
- `lastError`: Error message if failed
- `strategy`: "weekly" | "monthly"
- `region`: "hamburg"

### `events`
- `id`: Hash (title + date + location)
- `sourceId`: Reference to source
- `title`: Event title
- `description`: Short description
- `dateStart`: Timestamp
- `dateEnd`: Timestamp (optional)
- `location`: { name, address, district, lat, lng }
- `category`: "theater" | "outdoor" | "museum" | "music" | "sport" | "market" | "kreativ" | "lesen"
- `isIndoor`: Boolean
- `ageSuitability`: "4+", "0-3", etc.
- `priceInfo`: "8€", "Kostenlos", etc.
- `originalLink`: Deep link to event
- `region`: "hamburg"

## Costs (Estimated)

- **Firestore**: ~$0.01/month (small dataset)
- **Cloud Functions**: ~$0.10/month (weekly scraping)
- **OpenAI API**: ~$0.01 per scrape run (7 sources)

Total: **< $1/month** for basic usage
