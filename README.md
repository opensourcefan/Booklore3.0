# Booklore 3.0

A personal fork of [BookLore](https://github.com/adityachandelgit/BookLore) with extended features, UI customizations, and an optional AI-powered comic panel detection service.

> **Advisory:** This is a personal project, shared as-is. It is 100% vibe-coded. I am not a developer.
> I may or may not update it. I may or may not read the Issues. I will not delete it if I get upset — and I am always upset.
> Please fork freely and do whatever you like with it. I am not taking requests.

---

## Contents

- [Under the Hood](#under-the-hood)
- [Main Features](#main-features)
- [Installation](#installation)
  - [Requirements](#requirements)
  - [Fresh Install](#fresh-install)
  - [Update Existing Install](#update-existing-install)
  - [Install Without AI](#install-without-ai)
- [Sample `.env`](#sample-env)
- [Sample `docker-compose.yml`](#sample-docker-composeyml)
- [Saving Your Data](#saving-your-data)
  - [Application Settings](#application-settings)
  - [Book Files and Covers](#book-files-and-covers)
- [AI Panel Detection — Quick Start](#ai-panel-detection--quick-start)
- [Screenshots](#screenshots)

---

## Under the Hood

This fork includes a number of targeted fixes to improve reliability, memory efficiency, and UI responsiveness — particularly for larger libraries. No upstream features were removed.

- **~50% less peak memory per image operation** — reduced pixel decode ceiling and replaced a lazy image scaler that held source buffers in memory with a direct bicubic draw that flushes source memory immediately
- **Native image buffers always released** — flush calls are now guaranteed via `finally` blocks across all thumbnail generation paths, preventing silent leaks during error conditions
- **No more zombie subprocesses** — KEPUB conversion and CBR metadata extraction processes are now properly terminated in `finally` blocks; failed or timed-out operations can no longer accumulate as orphaned OS processes
- **Up to N× fewer database queries on Komga series pages** — a loop that previously ran a full eager-loaded table scan once per series on the page now runs a single query and groups results in memory
- **Covers load once, not on every navigation** — browser-cache headers added to all image endpoints (7-day TTL for book covers, 1-hour for author images); the existing cache-busting URL timestamps ensure stale images are never served
- **Sidebar navigation no longer rebuilds the book grid** — the Angular route reuse strategy now correctly stores and reattaches the "All Books" and "Not Shelfed" views, preventing unnecessary cover reloads when switching sidebar sections
- **HTTP download safety** — downloaded image payloads are now rejected if they exceed 5 MB before being handed to the image decoder; network connections for image fetching are bounded by connect (10 s) and read (30 s) timeouts, preventing runaway thread holds on slow or unresponsive sources

---

## Main Features

- **Comic Panel Detection AI** — Detects and saves panel flow data for CBZ/CBR comics using a bundled YOLO-based AI model. Enables panel-by-panel navigation in the reader.
- **Adjustable Cover Preview Panel** — Toggle the right-side cover preview on or off in Settings.
- **Customizable Upper Toolbar** — Add, remove, and reorder toolbar buttons; insert separators. Drag-and-drop support.
- **Adjustable Side Panels** — Resizable left and right sidebars.
- **Drag-and-Drop Sidebar Sorting** — Click, hold, and drag to reorder left sidebar elements.
- **Settings Backup & Restore** — Export and import your full application settings.
- **User-Defined Media Types** — Create custom media types (Magazines, Catalogs, Textbooks, etc.) and filter by them.
- **Title Row Controls** — Fine-grained tweaks for book card title display.
- **Sidebar Repositioned Controls** — Settings and Language Selection moved to the bottom of the left sidebar.
- **Telemetry Removed** — All upstream telemetry, support icons, and removed documentation links have been stripped out.
- **OIDC / Forward Auth Support** — OpenID Connect login and proxy forward-auth support included.
- **Language Selection** — Multi-language support with in-app language switcher.

---

## Installation

### Requirements

- Docker and Docker Compose
- MariaDB (included in the provided Compose file)

### Fresh Install

```bash
# 1. Download the Compose file
curl -O https://raw.githubusercontent.com/opensourcefan/Booklore3.0/develop/docker-compose.yml

# 2. Create your .env file (see Sample .env below)

# 3. Pull and start
docker compose pull
docker compose up -d

# 4. If AI is enabled, pull and start the AI container separately
docker compose pull booklore-ai-panel
docker compose up -d booklore-ai-panel
```

### Update Existing Install

```bash
curl -O https://raw.githubusercontent.com/opensourcefan/Booklore3.0/develop/docker-compose.yml
docker compose pull
docker compose up -d

# If AI is enabled:
docker compose pull booklore-ai-panel
docker compose up -d booklore-ai-panel
```

### Install Without AI

Omit `COMPOSE_PROFILES=ai` from your `.env`. No AI image will be pulled and no model files will be downloaded. AI features can be left disabled in **Settings > AI Panel Detection**.

---

## Sample `.env`

```ini
# User / Group IDs for file ownership
APP_USER_ID=1000
APP_GROUP_ID=1000

# Timezone
TZ=America/Vancouver

# Database connection
DATABASE_URL=jdbc:mariadb://mariadb:3306/booklore
DB_USER=booklore
DB_PASSWORD=ChangeMe@$@P

# MariaDB container
DB_USER_ID=1000
DB_GROUP_ID=1000
MYSQL_ROOT_PASSWORD=ChangeMe@$@P
MYSQL_DATABASE=booklore
REMOTE_USER_PASSWORD=ChangeMe@$@P

# Storage type: LOCAL (default) or NETWORK (all data written to MariaDB only)
#DISK_TYPE=NETWORK

# AI Panel Detection (optional — remove or comment out to disable AI)
COMPOSE_PROFILES=ai
AI_SERVICE_BASE_URL=http://booklore-ai-panel:8080
AI_PANEL_PORT=18080
```

---

## Sample `docker-compose.yml`

```yaml
services:
  mariadb:
    image: mariadb:11
    container_name: booklore-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql
    networks:
      - booklore-net

  booklore:
    image: ghcr.io/opensourcefan/booklore3.0:latest
    container_name: booklore
    restart: unless-stopped
    depends_on:
      - mariadb
    environment:
      DATABASE_URL: ${DATABASE_URL}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      APP_USER_ID: ${APP_USER_ID:-1000}
      APP_GROUP_ID: ${APP_GROUP_ID:-1000}
      TZ: ${TZ:-UTC}
      AI_SERVICE_BASE_URL: ${AI_SERVICE_BASE_URL:-}
    ports:
      - "6060:6060"
    volumes:
      - ./books:/books
      - ./data:/app-data
      - ./bookdrop:/bookdrop
    networks:
      - booklore-net

  booklore-ai-panel:
    image: ghcr.io/opensourcefan/booklore-panel-ai:latest
    container_name: booklore-ai-panel
    restart: unless-stopped
    profiles:
      - ai
    ports:
      - "${AI_PANEL_PORT:-18080}:8080"
    volumes:
      - ./data/ai-models:/models
    networks:
      - booklore-net

volumes:
  db-data:

networks:
  booklore-net:
```

> **Note:** This is a representative sample. Always use the `docker-compose.yml` pulled from the repository for the most up-to-date configuration.

---

## Saving Your Data

Booklore stores your data in two places. Back up both to ensure a complete recovery.

### Application Settings

Your admin configuration (libraries, users, shelves, metadata settings, etc.) lives in the MariaDB database.

**Export via the UI** — Go to **Settings → Global Preferences → Settings Transfer** and click **Export**. This downloads a `booklore-settings-*.json` file you can re-import on the same or a new instance.

**Full database backup (recommended for complete protection)** — Exports everything including all book metadata, read progress, and shelf assignments:

```bash
# Load your .env variables, then run:
docker exec mariadb mariadb-dump \
  --single-transaction --quick --no-tablespaces \
  -u root -p"$MYSQL_ROOT_PASSWORD" \
  booklore > "booklore_backup_$(date +%Y%m%d_%H%M%S).sql"
```

> See [docs/mariadb-backup-restore.html](docs/mariadb-backup-restore.html) for the full backup, restore, and automation guide.

### Book Files and Covers

Your actual book files, cover images, and thumbnails are **not** stored in the database. Back them up separately:

| Directory | Contents |
|---|---|
| `./books/` | All book files |
| `./data/` | Cover images, thumbnails, author images, AI model |
| `./bookdrop/` | Bookdrop inbox (if in use) |

A simple full backup copies all three:

```bash
tar -czf booklore-files-backup-$(date +%Y%m%d).tar.gz ./books ./data ./bookdrop
```

---

## AI Panel Detection — Quick Start

1. Add `COMPOSE_PROFILES=ai` to your `.env`
2. Pull and start all services (see [Installation](#installation) above)
3. Open **Settings > AI Panel Detection**
4. Enable **AI Panel Detection** and wait for status to show **READY**
   - The model is bundled inside the AI container image
   - On first start it is automatically seeded to `./data/ai-models/best.pt`
   - No manual file placement is required
5. Open a comic in the reader and use the AI button to scan the current book
6. Optionally run **Manual Panel Detection Scan** in AI settings to batch-process all comics

### AI Notes

- The AI compose profile is opt-in. Omitting `COMPOSE_PROFILES=ai` skips the AI image entirely.
- The AI container uses CPU-only inference to keep the image size manageable.
- If the model fails to load, use the **Reload Model** button in Settings.
- If running Booklore outside Docker, set `AI_SERVICE_BASE_URL` to the host-mapped endpoint (e.g., `http://localhost:18080`).

---

## Screenshots

<img src="assets/booklore3.0-screenshot1.png" width="800">

<img src="assets/booklore3.0-screenshot2.png" width="800">

<img src="assets/booklore3.0-screenshot3.png" width="800">
