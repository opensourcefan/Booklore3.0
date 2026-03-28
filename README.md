# Booklore 3.0

A personal fork of [BookLore](https://github.com/adityachandelgit/BookLore) with extended features, UI customizations, and an optional AI-powered comic panel detection service.

> **Advisory:** This is a personal project, shared as-is. It is 100% vibe-coded. I am not a developer.
> I may or may not update it. I may or may not read the Issues. I will not delete it if I get upset — and I am always upset.
> Please fork freely and do whatever you like with it. I am not taking requests.

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

---

## Stability & Performance Improvements

This fork includes a series of targeted fixes across four phases to improve reliability, memory usage, scalability, and UI responsiveness. No upstream features were removed.

### Phase 1 — Process Lifecycle Safety (v3.2.3)

| Area | Fix |
|---|---|
| `KepubConversionService` | Added `process.destroy()` and cleanup in a `finally` block; `kepub-convert` processes can no longer become zombie threads if conversion fails or times out |
| `CbxMetadataWriter` | Added `process.destroy()` and cleanup in a `finally` block; `unrar` processes are now reliably terminated after CBR metadata extraction |
| `KomgaCleanContextFilter` | New request filter that catches unhandled exceptions in the Komga-compatible API path and returns a clean `500` response instead of leaking internal stack traces |

**Resource impact:** Eliminates OS-level process leaks for every failed KEPUB conversion and CBR metadata extraction.

---

### Phase 2 — Memory & Buffer Efficiency (v3.2.4)

| Area | Fix |
|---|---|
| `FileService.MAX_IMAGE_PIXELS` | Reduced from 20 million to 10 million pixels. Limits peak heap allocation per image decode to ~120 MB (was ~240 MB for 20 MP images) |
| `FileService.resizeImage()` | Replaced `getScaledInstance` (returns a lazy `ToolkitImage` that holds the full source in memory) with a direct `Graphics2D` bicubic draw onto a pre-allocated `BufferedImage`. Source is flushed immediately after use |
| `FileService.createThumbnailFrom*` (seven methods) | Wrapped `originalImage.flush()` in `try-finally` blocks so the native pixel buffer is always released, even when downstream processing throws |
| `BookTableComponent` | Fixed event-listener leak: `resize` handler was registered as an arrow lambda and removed as a different lambda reference (no-op). Handler is now stored as an instance field so `addEventListener` and `removeEventListener` see the same reference |

**Resource impact:** Peak per-image heap cut by ~50%; native image buffers reliably freed after processing; DOM event listener no longer accumulates on every table render.

---

### Phase 3 — Scalability & HTTP Enforcement (v3.2.5)

| Area | Fix |
|---|---|
| `FileService.downloadImageFromUrlInternal()` | Added HTTP response body size check: if the downloaded payload exceeds `MAX_FILE_SIZE_BYTES` (5 MB), an `IOException` is thrown before the bytes reach `readImage()`. Prevents oversized or non-image responses from being fully buffered |
| `KomgaService.getAllSeries()` — null-libraryId path | `bookRepository.findAllWithMetadata()` was being called once per series name per page request inside a loop (N full eager-loaded DB scans per page). Fixed by hoisting the call outside the loop with lazy `Map<String, List<BookEntity>>` initialization using `Collectors.groupingBy`. DB calls per page: **N → 1** |

**Resource impact:** Eliminates runaway heap allocations from malicious/misconfigured image URLs; eliminates N×(full-table-scan + 6-table eager join) per Komga series page request.

---

### Phase 4 — Network Safety & UI Cache Performance (v3.2.6)

| Area | Fix |
|---|---|
| `BookMediaController` — thumbnail & cover endpoints | Added `Cache-Control: public, max-age=604800` (7 days) to all book image responses. The existing `?coverUpdatedOn` timestamp in the frontend URL serves as cache-busting, so long-lived caching is safe. Result: covers are served from the browser cache on subsequent navigations instead of triggering new network requests |
| `BookMediaController` — author image endpoints | Added `Cache-Control: public, max-age=3600` (1 hour) to author photo and thumbnail responses |
| `CustomReuseStrategy` (Angular) | Added `all-books` and `not-shelfed` routes to the stored-component list. These `BookBrowserComponent` instances were previously always destroyed and recreated on each navigation, forcing covers to reload. They are now stored and reattached like library/shelf/magic-shelf routes |
| `SecurityConfig.noRedirectRestTemplate` | Added `connectTimeout(10 s)` on the `HttpClient.Builder` and `setReadTimeout(30 s)` on the `JdkClientHttpRequestFactory`. The no-redirect template used for image URL downloads had no timeouts; a hung or slow remote could hold a virtual thread indefinitely |

**Resource impact:** Eliminates redundant image network requests during sidebar navigation; cover rebuild delay eliminated for cached routes; prevents unbounded thread hold on slow/hung image sources.

