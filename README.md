### Disclaimer
```ini
I am not a developer
All of my mods are %100 Vibe-Coded
I may or may not update this
I may or may not read the Issues
Please fork and go nuts with it
I am not taking requests
I will not delete this if I get upset, I am always upset
```

### Current State of Affairs
```ini
Latest build v3.2.0-AI
>>> Now has Comic Book Panel Detection AI service available. See below for applicable notes. <<<
```


### Install
```ini
1. curl -O https://raw.githubusercontent.com/opensourcefan/Booklore3.0/develop/docker-compose.yml

2. create .env with your settings

3. Optional: add COMPOSE_PROFILES=ai to .env if you want the AI service enabled

4. docker compose pull

5. docker compose up -d

6. If AI is enabled, refresh the AI service explicitly:
	docker compose pull booklore-ai-panel
	docker compose up -d booklore-ai-panel
```


### Update Existing Install
```ini
1. curl -O https://raw.githubusercontent.com/opensourcefan/Booklore3.0/develop/docker-compose.yml

2. docker compose pull

3. docker compose up -d

4. If AI is enabled, refresh the AI service explicitly:
	docker compose pull booklore-ai-panel
	docker compose up -d booklore-ai-panel
```


### AI Install Notes
```ini
Optional .env values for AI:

COMPOSE_PROFILES=ai
AI_SERVICE_BASE_URL=http://booklore-ai-panel:8080
AI_PANEL_PORT=18080

Notes:
- docker-compose.yml keeps AI optional through the ai compose profile.
- Add COMPOSE_PROFILES=ai to enable the AI container with normal docker compose up -d.
- Leave COMPOSE_PROFILES unset to install Booklore without downloading the AI image.
- The AI container image is pulled from GHCR only when the ai profile is enabled.
- The AI container image is ghcr.io/opensourcefan/booklore-panel-ai:latest.
- The published AI container uses CPU-only inference dependencies to keep the image smaller.
- The model is bundled inside the AI container image. No manual file placement required.
- On first start the model is automatically seeded to ./data/ai-models/best.pt for persistence.
- The model persists across container restarts, recreates, and image updates via the mounted volume.
- During first startup, the AI status will show STARTING while the model loads in the background.
- If the model fails to load, use the Reload Model button in Settings > AI Panel Detection.
```


### Sample .env
```ini
# Application Settings
APP_USER_ID=1000
APP_GROUP_ID=1000
TZ=America/Vancouver
AI_SERVICE_BASE_URL=http://booklore-ai-panel:8080
AI_PANEL_PORT=18080

# Database Connection (BookLore)
DATABASE_URL=jdbc:mariadb://mariadb:3306/booklore
DB_USER=booklore
DB_PASSWORD=ChangeMe@$@P

# Storage: LOCAL (default) or NETWORK (all data is written to mariadb only)
#DISK_TYPE=NETWORK

# Adds AI image to your regular >>docker compose pull && docker compose up -d<< routine.
COMPOSE_PROFILES=ai

# MariaDB Container Settings
DB_USER_ID=1000
DB_GROUP_ID=1000
MYSQL_ROOT_PASSWORD=ChangeMe@$@P
MYSQL_DATABASE=booklore
REMOTE_USER_PASSWORD=ChangeMe@$@P
```


### AI Quick Start
```ini
1. Add COMPOSE_PROFILES=ai to .env

2. Start Booklore with:
	docker compose pull
	docker compose up -d
	docker compose pull booklore-ai-panel
	docker compose up -d booklore-ai-panel

3. Open Settings > AI Panel Detection

4. Turn on Enable AI Panel Detection

5. Wait for Status to change to READY
   The model is bundled in the AI container image.
   On first start it is seeded to ./data/ai-models/best.pt automatically.
   No manual file placement is needed.

6. Open a comic in the reader and use the AI button to scan the current book

7. Optional: use Manual Panel Detection Scan in AI settings to process comics that do not already have saved AI panel data

8. If Booklore is running outside Docker, point AI_SERVICE_BASE_URL to the host-mapped endpoint, for example http://localhost:18080
```


### Install Without AI
```ini
If you do not want AI features:

1. Do not set COMPOSE_PROFILES=ai

2. Run docker compose up -d

3. Leave AI Panel Detection disabled in Settings

4. No AI image will be pulled and no AI model files will be downloaded
```


### Major Changes from Original
```ini
Cover Preview Panel (Adjustable) - On/Off Switch in Settings
Settings button moved to bottom of Left Sidebar
Language Selection  moved to bottom of Left Sidebar
Adjustable Left and Right Sidepanels
Removal of all Telemetry
Removal of Support Icon
Removal of Documentation links since orginal websites were removed.
Upper Toolbar Customization - add, remove, reorder, seperators ... Button on far right side
Click,hold,and drag sorting of Left Sidebar Elements.
Settings Backup and Restore added.
User generated Media Types ie Magazines, Catalog, Text Books etc can be added and filtered.
Title row tweaks and controls for book cards.
```


<img src="assets/booklore3.0-screenshot1.png" width="800">

<img src="assets/booklore3.0-screenshot2.png" width="800">

<img src="assets/booklore3.0-screenshot3.png" width="800">
