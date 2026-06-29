# User Profiles and Sandboxing Guide

Fable supports multi-user environments, allowing you to share a single server instance while keeping profiles, reading progress, shelves, and library visibility separate.

This document describes how to configure independent, sandboxed user profiles and outlines the caveats and security limits of multi-tenancy in Fable.

## Step-by-Step Setup Guide

Follow these steps to configure a sandboxed profile for another user:

### Step 1: Create Isolated Directories on the Host Filesystem
Fable reads files from the directories you mount. To sandbox user books, you must create separate directories on your **host machine's filesystem** (not inside the container).

1. On your host machine, navigate to the directory containing your Fable `docker-compose.yml` file.
2. Open the `books` folder (which maps to `/books` inside the container).
3. Create separate folders inside it for each user:
   ```bash
   # On your host server:
   mkdir -p books/user1
   mkdir -p books/user2
   ```

> [!TIP]
> **No Docker Restart Required:** You do not need to modify your `docker-compose.yml` or restart Docker to add libraries. As long as you create these directories inside an existing mounted parent folder (like the default `books` volume mount), any new subfolders will automatically and instantly be visible inside the container at `/books/user1` and `/books/user2`.

### Step 2: Create a Dedicated Library
1. Log in to the Fable UI as an **Admin** user.
2. Open **Settings** (gear icon in the bottom-left sidebar) and navigate to **Library Management**.
3. Click **Create Library**.
4. Name it appropriately (e.g., `User 2's Library`).
5. In the paths configuration, enter the path to the isolated directory (e.g., `/books/user2`).
6. Save the library.

### Step 3: Create the User Account
1. Open **Settings → User Management**.
2. Click **Create User**.
3. Enter their username, display name, email, and password.
4. **Important**: Leave the **Admin** checkbox unchecked.

### Step 4: Configure Permissions & Library Restrictions
1. While editing the new user, look at the **Library Mapping** section.
2. Select **only** their newly created library (e.g., `User 2's Library`) and uncheck all others.
3. Review their permissions checklist:
   * Keep **Library Management** disabled so they cannot map library paths to other directories on disk.
   * Keep **Book Deletion** disabled if you want to prevent them from deleting book files from the shared disk (or toggle **Allow File Deletion** off globally in settings).
4. Save the user changes.

---

## ⚠️ Caveats and Security Considerations

When sharing a single Fable instance across multiple users, be aware of the following multi-tenancy limits:

### 1. Admins Bypass All Sandboxes
Any account with the **Admin** permission (the `permission_admin` column in the database) has full view access to all libraries and settings on the instance. If you need to restrict a user, do not give them admin access.

### 2. Shared Container and Database
Fable runs within a single Docker container and connects to a single MariaDB database. 
* There is no OS-level virtualization or kernel-level network isolation between profiles. 
* Database tables (such as `books`, `authors`, and `metadata`) are shared, though filtered at the application level via the `user_library_mapping` join table.

### 3. File System Level Exposure
If a user is granted **Library Management** permission, they can create libraries and map them to *any* folder structure mounted inside the container. This means they could theoretically map `/books/user1` to their library and view another user's books. Only grant this permission to trusted accounts.

### 4. Shared CPU/Memory Resources
Heavy tasks such as:
* Directory scans/rescans
* Bulk metadata fetching
* AI comic panel detection scanning
* AI semantic search embedding (CPU-based inference)

All run on the same shared host hardware. Heavy usage by one user will impact the performance and response times for other active users.

### 5. Single Network Port
Fable binds to a single port (default `6060`). Subdomain-based tenant isolation (e.g., `user1.fable.example.com` routing to a different database) is not natively supported.
