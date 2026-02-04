# ahoi Backend - Setup Guide

## Lokale Entwicklung

### 1. Python Virtual Environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 2. Dependencies installieren

```bash
pip install -r requirements.txt

# Playwright Browser (einmalig)
playwright install chromium
```

### 3. Environment konfigurieren

```bash
cp .env.example .env
# .env editieren und OPENAI_API_KEY eintragen
```

### 4. Backend starten

```bash
python main.py
# oder
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API ist dann erreichbar unter: http://localhost:8000

### 5. API Dokumentation

Nach dem Start erreichbar unter:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## VPS Deployment

### 1. Server vorbereiten

```bash
# Als root auf dem VPS
apt update && apt upgrade -y
apt install python3.11 python3.11-venv git -y

# User für die App erstellen
useradd -m -s /bin/bash ahoi
```

### 2. App deployen

```bash
# Als ahoi user
su - ahoi
mkdir -p /opt/ahoi
cd /opt/ahoi

# Code clonen oder kopieren
git clone <repo-url> .
# oder: scp/rsync vom lokalen Rechner

# Virtual Environment
python3.11 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
playwright install chromium
```

### 3. Environment konfigurieren

```bash
cd /opt/ahoi/backend
cp .env.example .env
nano .env
# OPENAI_API_KEY eintragen
```

### 4. Systemd Service erstellen

```bash
# Als root
sudo nano /etc/systemd/system/ahoi.service
```

```ini
[Unit]
Description=ahoi Backend API
After=network.target

[Service]
User=ahoi
Group=ahoi
WorkingDirectory=/opt/ahoi/backend
Environment="PATH=/opt/ahoi/venv/bin"
ExecStart=/opt/ahoi/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ahoi
sudo systemctl start ahoi
sudo systemctl status ahoi
```

### 5. Cron Jobs einrichten

```bash
# Als ahoi user
crontab -e
```

Folgende Zeilen hinzufügen:

```cron
# Wöchentliches Scraping (Sonntag 3:00 Uhr)
0 3 * * 0 /opt/ahoi/venv/bin/python /opt/ahoi/backend/scrape_all.py >> /var/log/ahoi/scrape.log 2>&1

# Tägliche Bereinigung (4:00 Uhr)
0 4 * * * /opt/ahoi/venv/bin/python /opt/ahoi/backend/cleanup.py >> /var/log/ahoi/cleanup.log 2>&1
```

Log-Ordner erstellen:

```bash
sudo mkdir -p /var/log/ahoi
sudo chown ahoi:ahoi /var/log/ahoi
```

### 6. Nginx Reverse Proxy (optional)

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/ahoi
```

```nginx
server {
    listen 80;
    server_name api.ahoi.example.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ahoi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## API Endpoints

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/api/health` | GET | Health Check |
| `/api/events` | GET | Events abrufen (mit Filtern) |
| `/api/events/{id}` | GET | Einzelnes Event |
| `/api/sources` | GET | Alle Quellen |
| `/api/sources` | POST | Neue Quelle hinzufügen |
| `/api/sources/{id}` | GET | Einzelne Quelle |
| `/api/sources/{id}` | PATCH | Quelle aktualisieren |
| `/api/sources/{id}` | DELETE | Quelle löschen |
| `/api/sources/{id}/scrape` | POST | Manuell scrapen |

### Events Filter

```
GET /api/events?region=hamburg&category=theater&from_date=2024-01-01&is_indoor=true&limit=50
```

---

## Manuelles Scraping

```bash
# Alle aktiven Quellen scrapen
cd /opt/ahoi/backend
source ../venv/bin/activate
python scrape_all.py

# Alte Events aufräumen
python cleanup.py
```
