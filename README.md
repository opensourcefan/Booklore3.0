<p align="center">
  <a href="https://github.com/opensourcefan/Fable/tags"><img src="https://img.shields.io/github/v/tag/opensourcefan/Fable?label=last%20tag&style=flat-square&color=blue" alt="Last Tag"></a>
  <a href="https://github.com/opensourcefan/Fable/actions/workflows/develop-pipeline.yml?query=branch%3Adevelop"><img src="https://img.shields.io/github/actions/workflow/status/opensourcefan/Fable/develop-pipeline.yml?branch=develop&label=develop%20pipeline&style=flat-square" alt="Develop pipeline"></a>
  <a href="https://github.com/opensourcefan/Fable/blob/develop/LICENSE"><img src="https://img.shields.io/github/license/opensourcefan/Fable?style=flat-square" alt="License"></a>
  <a href="https://github.com/opensourcefan/Fable/stargazers"><img src="https://img.shields.io/github/stars/opensourcefan/Fable?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/opensourcefan/Fable/issues"><img src="https://img.shields.io/github/issues/opensourcefan/Fable?style=flat-square" alt="Issues"></a>
</p>


# Fable

A personal fork of [Booklore] with extended features, UI customizations, and an optional AI-powered comic panel detection service.

> **Advisory:** This is a personal project, shared as-is. It is 100% vibe-coded. I am not a developer.
> I may or may not update it. I may or may not read the Issues. I will not delete it if I get upset, I'm always upset.
> Please fork freely and do whatever you like with it. I am not taking requests.

> [!IMPORTANT]
> **DEPLOYMENT & MAINTENANCE NOTICE (June 2026)**
> This repository is maintained and updated **periodically (monthly)**. Automated dependency updates (Dependabot) have been disabled to minimize build noise and prevent regressions, but security patches and library upgrades are evaluated and applied manually.
> Because this application is intended for private use, it is highly recommended to run it within your local home network (LAN) or behind a secure VPN (such as Tailscale, WireGuard, or OpenVPN). If exposing it publicly, always deploy it behind a secure reverse proxy with authentication (such as Cloudflare Tunnels, Authelia, or Authentik).

---

## Contents

- [Installation](#installation)
  - [Requirements](#requirements)
  - [Fresh Install](#fresh-install)
  - [Update Existing Install](#update-existing-install)
  - [Install Without AI](#install-without-ai)
- [Sample `.env`](#sample-env)
- [Sample `docker-compose.yml`](#sample-docker-composeyml)
- [Adding AI Search to an Existing Installation](#adding-ai-search-to-an-existing-installation)
- [Saving Your Data](#saving-your-data)
  - [Application Settings](#application-settings)
  - [Book Files and Covers](#book-files-and-covers)
- [AI Features — Quick Start](#ai-features--quick-start)
- [Familiarization Guide](#familiarization-guide)

---

## Installation

### Requirements

- Docker and Docker Compose
- MariaDB (included in the provided Compose file)

### Fresh Install

```bash
# 1. Download the Compose file
curl -O https://raw.githubusercontent.com/opensourcefan/Fable/develop/docker-compose.yml ## Use the .env to enable AI.

# 2. Create your .env file (see Sample .env below)

# 3. Pull and start
docker compose pull
docker compose up -d

# 4. If AI is enabled, AI containers will install automatically as they should be inserted into your docker-compose.yml
```

### Update Existing Install

```bash
curl -O https://raw.githubusercontent.com/opensourcefan/Fable/develop/docker-compose.yml
docker compose pull
docker compose up -d

# If AI is enabled:
docker compose pull app-ai-panel
docker compose up -d app-ai-panel
```

### Optional RAR Binary For CBR Metadata Writes

If you want Fable to preserve `.cbr` files during metadata writes instead of falling back to a slower `.cbz` conversion, place a compatible Linux `rar` binary at `./docker/rar/rar` before starting the container.

- The repository `docker-compose.yml` now mounts `./docker/rar` into the container at `/opt/fable-rar`.
- The container entrypoint automatically exports `FABLE_RAR_BIN=/opt/fable-rar/rar` when that file exists and is executable.
- If no `rar` binary is provided, Fable keeps its current fallback behavior and may convert `.cbr` to `.cbz` when writing embedded metadata.

### Install Without AI

Omit `COMPOSE_PROFILES=ai` from your `.env`. No AI image will be pulled and no model files will be downloaded. AI features can be left disabled in **Settings > AI Panel Detection**.

---

## Sample `.env`

```ini
# User / Group IDs for file ownership
APP_USER_ID=1000
APP_GROUP_ID=1000

# Timezone
TZ=Etc/UTC

# Database connection
DATABASE_URL=jdbc:mariadb://mariadb:3306/fable
DB_USER=fable
DB_PASSWORD=ChangeMe@$@P

# MariaDB container
DB_USER_ID=1000
DB_GROUP_ID=1000
MYSQL_ROOT_PASSWORD=ChangeMe@$@P
MYSQL_DATABASE=fable
REMOTE_USER_PASSWORD=ChangeMe@$@P

# Storage type: LOCAL (default) or NETWORK (all data written to MariaDB only, using this is not usually required)
DISK_TYPE=LOCAL

##################################################################
#                                                                #
#    ###  ###     #### ##### ##### ##### ### #   #  ###   ####   #
#   #   #  #     #     #       #     #    #  ##  # #     #       #
#   #####  #      ###  ####    #     #    #  # # # #  ##  ###    #
#   #   #  #         # #       #     #    #  #  ## #   #     #   #
#   #   # ###    ####  #####   #     #   ### #   #  ###  ####    #
#                                                                # 
##################################################################

# AI Features: Panel Detection & Semantic Search
# Optional — uncomment (delete # from the front) the 5 lines marked with (# <<) to enable all AI features.

### 1. Tell docker-compose to start the AI containers
# COMPOSE_PROFILES=ai  # <<

### 2. Tell the main Fable app where to talk to the AI containers internally
# AI_SERVICE_BASE_URL=http://app-ai-panel:8080  # <<
# AI_SEARCH_SERVICE_BASE_URL=http://fable-ai-search:8080  # <<

### 3. Expose the AI services to your host machine (for debugging or direct access)
# AI_PANEL_PORT=18080  # <<
# AI_SEARCH_PORT=18081  # <<

#### ---- AI Settings ----
#### AI models are now configured directly inside the Fable UI!
#### Go to Settings -> AI / AI Search to set your models,
#### API keys, and external endpoints (Zero-Config Architecture).
```

---

## Sample `docker-compose.yml`

```yaml
services:
  fable:
    # Channel strategy:
    #   :stable  – last tagged release (conservative, default)
    #   :latest  – bleeding-edge develop build (may contain unfinished work)
    #   :vX.Y.Z  – pinned semver release (immutable, best for reproducibility)
    #   @sha256: – digest-pinned (most reproducible, immune to tag overwrites)
    #
    # Note: fable-panel-ai / fable-search-ai are only republished when docker/ai-panel
    # or docker/ai-search changes. Unrelated Fable app releases no longer move those tags.
    # For reproducible deployments pin to a specific semver tag or SHA digest:
    #   image: ghcr.io/opensourcefan/booklore3:v3.15.46
    #   image: ghcr.io/opensourcefan/booklore3@sha256:<digest>
    image: ghcr.io/opensourcefan/fable:stable
    container_name: fable
    restart: unless-stopped
    depends_on:
      mariadb:
        condition: service_healthy
    environment:
      - USER_ID=${APP_USER_ID}
      - GROUP_ID=${APP_GROUP_ID}
      - TZ=${TZ}
      - DATABASE_URL=${DATABASE_URL}
      - DATABASE_USERNAME=${DB_USER}
      - DATABASE_PASSWORD=${DB_PASSWORD}
      - DISK_TYPE=${DISK_TYPE}
      - AI_SERVICE_BASE_URL=${AI_SERVICE_BASE_URL:-http://app-ai-panel:8080}
      - AI_SEARCH_SERVICE_BASE_URL=${AI_SEARCH_SERVICE_BASE_URL:-http://fable-ai-search:8080}
    ports:
      - "6060:6060"
    volumes:
      - ./data:/app/data
      - ./books:/books
      - ./bookdrop:/bookdrop
      - ./docker/rar:/opt/booklore-rar:ro  # Optional: mount a compatible Linux rar binary at ./docker/rar/rar for in-place CBR metadata writes
    networks:
      - fable_shared

  mariadb:
    image: lscr.io/linuxserver/mariadb:11.4.11
    container_name: mariadb
    restart: unless-stopped
    environment:
      - PUID=${DB_USER_ID}
      - PGID=${DB_GROUP_ID}
      - TZ=${TZ}
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
      - MYSQL_DATABASE=${MYSQL_DATABASE}
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASSWORD}
      - REMOTE_USER_PASSWORD=${REMOTE_USER_PASSWORD}
    volumes:
      - ./mariadb/config:/config
      - ./mariadb/conf.d:/config/mariadb/conf.d
    ports:
      - "3306:3306"
    networks:
      - fable_shared
    healthcheck:
      test: ["CMD", "mariadb-admin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 10

  app-ai-panel:
    image: ${AI_PANEL_IMAGE:-ghcr.io/opensourcefan/fable-panel-ai:stable}
    container_name: app-ai-panel
    profiles: ["ai"]
    restart: unless-stopped
    environment:
      - TZ=${TZ}
      - HF_HOME=/models
    volumes:
      - ./data/ai-models:/models
    ports:
      - "${AI_PANEL_PORT:-18080}:8080"
    networks:
      - fable_shared
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/health', timeout=3)"]
      interval: 30s
      timeout: 5s
      retries: 5

  fable-ai-search:
    image: ${AI_SEARCH_IMAGE:-ghcr.io/opensourcefan/fable-search-ai:stable}
    container_name: fable-ai-search
    profiles: ["ai"]
    restart: unless-stopped
    environment:
      - TZ=${TZ}
      - DB_HOST=mariadb
      - DB_PORT=3306
      - DB_NAME=${MYSQL_DATABASE}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
    volumes:
      - ./data/ai-search-models:/models
    ports:
      - "${AI_SEARCH_PORT:-18081}:8080"
    depends_on:
      mariadb:
        condition: service_healthy
    networks:
      - fable_shared
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/health', timeout=3)"]
      interval: 30s
      timeout: 5s
      retries: 5

networks:
  fable_shared:
    name: fable_shared
```

### Adding AI Search to an Existing Installation

If you already have Fable running and want to add AI Semantic Search, follow these steps. Your existing database, books, and settings are preserved — the AI search service connects to the same MariaDB instance and stores embeddings in a separate table.

#### Step 1: Update your `docker-compose.yml`

Copy the lines below into your existing `docker-compose.yml` file. Paste them under the `services:` section, right after the `app-ai-panel` entry (or after `mariadb` if you don't use panel detection):

```yaml
  fable-ai-search:
    image: ${AI_SEARCH_IMAGE:-ghcr.io/opensourcefan/fable-search-ai:stable}
    container_name: fable-ai-search
    profiles: ["ai"]
    restart: unless-stopped
    environment:
      - TZ=${TZ}
      - DB_HOST=mariadb
      - DB_PORT=3306
      - DB_NAME=${MYSQL_DATABASE}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
    volumes:
      - ./data/ai-search-models:/models
    ports:
      - "${AI_SEARCH_PORT:-18081}:8080"
    depends_on:
      mariadb:
        condition: service_healthy
    networks:
      - fable_shared
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/health', timeout=3)"]
      interval: 30s
      timeout: 5s
      retries: 5
```

#### Step 2: Update your `.env` file

Add these lines to your `.env`:

```ini
COMPOSE_PROFILES=ai
AI_SEARCH_SERVICE_BASE_URL=http://fable-ai-search:8080
AI_SEARCH_PORT=18081
```

#### Step 3: Pull and start the new service safely

**If your existing containers are running**, use this approach to avoid "container already exists" and "port already bound" errors:

```bash
# Pull the new AI search image
docker compose pull fable-ai-search

# Stop only the main Fable container (preserves MariaDB and your data)
docker compose stop fable

# Bring everything back up, including the new AI search service
docker compose --profile ai up -d

# Verify all containers are healthy
docker compose ps
```

**If you get a "port is already allocated" error**, check if anything else is using port 18081:

```bash
# Check what's using the AI search port
sudo ss -tlnp | grep 18081

# If the port is in use, change AI_SEARCH_PORT in your .env to an available port:
# AI_SEARCH_PORT=18082
```

**If you get a "container already exists" error**, remove the stale container reference:

```bash
# Remove the old container (data volumes are unaffected)
docker rm fable-ai-search 2>/dev/null || true

# Then start fresh
docker compose --profile ai up -d
```

#### Step 4: Enable AI Search in the UI

1. Open **Settings > AI**
2. Enable **AI Semantic Search**
3. Wait for the status to show **READY**
4. Embed your books: Click the three dots on any book card → **Embed for AI Search**

---

## Saving Your Data

A recoverable Fable backup is a coordinated set: database dump, library media, app data, and deployment configuration from the same recovery window. Keep encrypted copies off the Fable host and test restores periodically. See the [Backup and Restore workflow](fable-ui/public/docs/guide/sec26.html) for the complete operator checklist.

### Application Settings

Your users, libraries, books, shelves, progress, annotations, and most application state live in MariaDB.

**Export application settings via the UI** — Go to **Settings → Backups → App Settings** and click **Export**. This downloads a `fable-settings-*.json` file containing application-wide settings only. It is not a database dump and does not contain users, libraries, books, shelves, progress, annotations, media, or email provider/recipient records. Fields named `clientSecret`, `apiKey`, and `cookie` are redacted; re-enter required secrets after import.

**Create a logical database dump** — Review the generated command under **Settings → Backups → Database Export**, or run a deployment-appropriate `mariadb-dump`. For the default Compose service:

```bash
# Load your .env variables, then run:
docker exec mariadb mariadb-dump \
  --single-transaction --quick --no-tablespaces \
  -u root -p"$MYSQL_ROOT_PASSWORD" \
  fable > "fable_backup_$(date +%Y%m%d_%H%M%S).sql"
```

Verify the command succeeded and the SQL file is non-empty. The in-app Database Export page copies a command; Fable does not execute the dump.

### Book Files and Covers

Your actual book files, cover images, and thumbnails are **not** stored in the database. Back them up separately:

| Directory | Contents |
|---|---|
| `./books/` | All book files |
| `./data/` | Cover images, thumbnails, author images, AI model |
| `./bookdrop/` | Shared BookDrop inbox (if in use) |
| `docker-compose.yml`, `.env` | Deployment topology, versions, mounts, and settings (protect secrets) |

Personal BookDrop files are under `./books/_users/{id}/bookdrop/`, so they are included with the books copy rather than the shared `./bookdrop/` directory.

A simple file archive can capture the mounted content, but coordinate it with the database dump and include deployment configuration:

```bash
tar -czf fable-files-backup-$(date +%Y%m%d).tar.gz \
  ./books ./data ./bookdrop ./docker-compose.yml ./.env
```

Store ownership/path-mapping notes and the Fable/MariaDB versions with the backup. Keep the only recovery copy off-host, encrypted, and periodically restore it into an isolated disposable stack before relying on it.

---

## AI Features — Quick Start

1. Add `COMPOSE_PROFILES=ai` to your `.env`
2. Pull and start all services (see [Installation](#installation) above)
3. Open **Settings > AI Tab**
4. Enable **AI Panel Detection** and/or **AI Semantic Search** and wait for status to show **READY**
   - The models are bundled inside the AI container images
   - On first start they are automatically seeded to the mounted models folders
   - No manual file placement is required
5. **For Panel Detection**: Open a comic in the reader and use the AI button to scan the current book. Optionally run a batch scan from settings.
6. **AI Search Features**:
   - **Global AI Search:** Click the sparkly blue **AI Search** icon in the topbar or library search fields to search your entire collection by concepts and themes.
   - **Book-Specific AI Search:** Click the glowing **AIS** badge on any book card to ask questions specifically about that book.
   - **Selected Books AI Search:** Select multiple books in the browser and search only those selected books by clicking the sparkle button in the search field or choosing **AI-Search Selected** from the selection actions toolbar dropdown.
   - **Note:** Make sure you have embedded your books first (Click the three dots on any book card -> **Embed for AI Search**).
   - **Zero Configuration Needed:** Fable comes with everything you need built-in! The AI search engine (powered by Ollama) runs automatically inside its own secure container. You don't need to install any external software or configure network settings to get started. Just pick a preset in your `.env` file and enjoy.

### AI Notes

- **Advanced Configuration**: See [AI-Search-Configuration.md](docs/AI-Search-Configuration.md) for how to tune semantic search, change models, or use external providers (like Ollama).
- The AI compose profile is opt-in. Omitting `COMPOSE_PROFILES=ai` skips the AI images entirely.
- The AI containers use CPU-only inference to keep the image size manageable.
- You can override the AI Search model by uncommenting # AI_Search_EMBEDDING or LLM in your `.env`.
- Optional lock-down: set the same `AI_SEARCH_SHARED_SECRET` on both the API and `fable-ai-search` containers to require a shared header on `/v1/*` (see [AI-Search-Configuration.md](docs/AI-Search-Configuration.md)). Leave blank for default open Docker-network trust.
- If the models fail to load, use the **Reload** buttons in Settings.
- If running Fable outside Docker, set `AI_SERVICE_BASE_URL` and `AI_SEARCH_SERVICE_BASE_URL` to the host-mapped endpoints.

---

## Familiarization Guide

For a complete walkthrough of every feature — libraries, importing, reading, shelves, metadata, search, AI panel detection, OPDS, user management, settings, backups, and more — see the **[Fable Familiarization Guide](fable-ui/public/docs/guide/index.html)**. It is also accessible from within the app via the <i class="pi pi-book"></i> **User Guide** button at the bottom of the left sidebar.

---

## Codebase Maintenance & Periodic Updates
Automated dependency updates (Dependabot) have been deactivated to reduce build noise and avoid breaking the strict dependency structures expected by the CI/CD pipeline. Instead, this repository is maintained manually, with security alerts and dependency upgrades evaluated and applied on a monthly or periodic basis. This strategy prevents regressions while keeping the application secure and up to date. Updates must follow the guidelines in [.agent/workflows/maintenance.md](.agent/workflows/maintenance.md) to ensure zero-regression releases.
