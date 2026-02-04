Markdown
# Project Specification: Family Event Planner App

**Role:** You are a Senior Fullstack Architect & Developer.
**Goal:** Build a native iOS app (via Expo) backed by Firebase that aggregates family-friendly events from various unstructured websites using a Hybrid Scraping approach (Code + LLM).

---

## 1. Tech Stack & Constraints

* **Frontend:** React Native (Expo SDK 50+), TypeScript, NativeWind (TailwindCSS), Expo Router (File-based routing), FlashList.
* **Backend:** Firebase (Firestore, Cloud Functions Gen 2 using Python 3.11+).
* **AI/LLM:** OpenAI API (`gpt-4o-mini`) or similar cost-effective model.
* **Scraping:** Python (`playwright` or `requests`), `beautifulsoup4`.
* **Maps/Weather:** OpenWeatherMap API, Google Maps API (or Apple Maps via `react-native-maps`).
* **Icons:** `lucide-react-native` (No Emojis allowed in UI).

---

## 2. Architecture: The "Smart Scraper" Pipeline

We use a "Hybrid Approach" to minimize costs while maintaining robustness.

### Workflow for adding a new Source (Cloud Function):
1.  **Input:** User provides a root URL (e.g., `theatre-xyz.de`).
2.  **Stage 1 - Navigation Discovery (Hybrid):**
    * *Attempt A (Code/Regex):* Fetch HTML. Look for `<a>` tags containing keywords ["Spielplan", "Programm", "Kalender", "Termine"]. If found -> Use that URL.
    * *Attempt B (LLM Fallback):* If A fails, send HTML structure (nav only) to LLM: "Identify the URL that points to the event calendar."
3.  **Stage 2 - Data Extraction (LLM):**
    * Fetch the content of the target URL.
    * Convert HTML to Markdown/Text to reduce tokens.
    * **LLM Task:** Extract events as JSON. Filter logic: "Is this suitable for a 4-year-old?".
4.  **Stage 3 - Deduplication & Storage:**
    * Generate Hash: `md5(lowercase(title) + date + location)`.
    * Check Firestore for existing hash. If exists -> Skip or Update. If new -> Create.

---

## 3. Data Model (Firestore Schema)

**Collection: `sources`**
```typescript
interface Source {
  id: string; // UUID
  name: string; // e.g., "Klecks Theater"
  inputUrl: string; // User provided: "www.klecks.de"
  targetUrl: string | null; // Discovered: "www.klecks.de/programm-2026"
  isActive: boolean;
  status: 'active' | 'error' | 'pending';
  lastScraped: Timestamp;
  strategy: 'weekly' | 'monthly';
}
Collection: events

TypeScript
interface Event {
  id: string; // Deduplication Hash
  sourceId: string; // Ref to sources
  title: string;
  description: string; // Short summary
  dateStart: Timestamp;
  location: {
    name: string;
    address: string;
    lat: number; // For map radius search
    lng: number;
  };
  category: 'theater' | 'outdoor' | 'museum' | 'music' | 'sport' | 'market';
  isIndoor: boolean; // For weather filter
  ageSuitability: string; // e.g., "4+"
  priceInfo: string; // e.g., "5€" or "Free"
  originalLink: string; // Deep link to event
  weatherForecast?: string; // Updated via API closer to date (optional)
}
4. Frontend Requirements (Expo)
UI/UX Guidelines
Clean Look: Use Lucide Icons mapping to categories (e.g., Theater = DramaMasks, Outdoor = Tree).

Colors: Soft, family-friendly palette but high contrast.

Views/Screens
Smart Feed (Home):

Vertical list of upcoming events.

Filters (Top Bar): "This Weekend", "Indoor Only" (if raining), "Max Distance".

Map View:

Map showing pins for events in the selected timeframe.

Source Manager:

Input field to add a new URL.

List of current sources with status indicators (Green/Red dots).