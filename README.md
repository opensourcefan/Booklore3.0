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
Latest build v3.1.5
Most of the DESKTOP UI has been modified to my liking. 
Currently working on improving the MOBILE UI 
Title row tweaks and controls for book cards.
```


### Install
```ini
1. curl -O https://raw.githubusercontent.com/opensourcefan/Booklore3.0/develop/docker-compose.yml

2. create .env with your settings

3. docker compose up -d
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
- The model files are stored in ./data/ai-models.
- First startup can take a while because the AI model may need to download and initialize.
- During first startup, the AI status may show STARTING until the model is ready.
```

### AI Quick Start
```ini
1. Add COMPOSE_PROFILES=ai to .env

2. Start Booklore normally with docker compose up -d

3. Open Settings > AI Panel Detection

4. Turn on Enable AI Panel Detection

5. Wait for Status to change to READY

6. If Status shows STARTING, give it time on first run while the model downloads/prepares

7. Open a comic in the reader and use the AI button to scan the current book

8. Optional: use Scan Missing Comics in AI settings to process comics that do not already have saved AI panel data

9. If Booklore is running outside Docker, point AI_SERVICE_BASE_URL to the host-mapped endpoint, for example http://localhost:18080
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
