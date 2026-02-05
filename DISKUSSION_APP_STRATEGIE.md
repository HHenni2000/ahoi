# ahoi - App-Strategie Diskussion

## Themen zum Besprechen

### 📅 Scraping-Zuverlässigkeit
- Funktionieren genug Theater-Seiten richtig?
- Sind die Ergebnisse konsistent und vollständig?
- Problem: Nur 4-7 Events statt erwarteter >20 bei manchen Theatern
- Werden Events zufällig/willkürlich gefunden?

### 💰 Kosten
- LLM-Calls zu teuer langfristig?
- Aktuelle Token-Kosten pro Scraping-Durchlauf: ~$0.01-0.05
- Bei täglichem Scraping von 20+ Quellen: ~$10-30/Monat
- Ist das nachhaltig?

### 🎯 Use Case / Produktvision
- Macht die App überhaupt Sinn so?
- Zielgruppe klar definiert? (Familien mit Kindern 4+)
- Gibt es genug Events in Hamburg?
- Konkurrenz: Kindaling, andere Plattformen
- Unique Value Proposition?

### 🔧 Tech-Stack / Architektur
- Ist der Scraping-Ansatz zu komplex/fragil?
- Alternative: Manuelle Pflege statt Scraping?
- Alternative: APIs von Event-Plattformen nutzen?
- Hybrid-Ansatz zu komplex?
- LLM vs. Code-Balance richtig?

### 📱 App-Features / UX
- Fehlen wichtige Funktionen?
- Karten-Ansicht ausreichend?
- Filter gut genug?
- Push Notifications nötig?
- Favoriten/Merkliste?
- Kalender-Integration?

### 🗄️ Datenqualität
- Location-Daten vollständig genug? (Geocoding)
- Kategorisierung korrekt?
- Beschreibungen hilfreich?
- Familienfreundlichkeits-Filter zu streng/zu locker?

### 🔄 Maintenance / Langfristig
- Wie viel Pflege braucht das System?
- Brechen Scraper bei Website-Änderungen?
- Monitoring/Alerting nötig?
- Skaliert das auf andere Städte?

### 💡 Alternative Ansätze
- Crowd-sourced Events (User können Events einreichen)?
- Kooperation mit Veranstaltern (direkte Daten)?
- RSS/iCal-Feeds nutzen statt Scraping?
- Nur kuratierte Auswahl statt vollständiger Scrape?

---

## Notizen aus der Diskussion

_(Hier Notizen hinzufügen während wir sprechen)_

### 2026-02-04: Scraping-Probleme Theater
- Allee Theater: Nur 7 von 50+ Events
- Tourneetheater: 4-7 Events, wirken random
- Vermutung: VPS hat alte Version oder Datumsfilter-Problem
