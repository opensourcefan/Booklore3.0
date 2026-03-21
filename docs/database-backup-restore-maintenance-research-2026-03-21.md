# Database Backup and Restore Research (MariaDB)

Date: 2026-03-21
Scope: Feasibility review for in-app backup/restore with safer maintenance mode workflow.

## 1) Executive Summary

- It is feasible to support database export/import for this app using MariaDB-standard tools.
- Current runtime already supports logical export from the running MariaDB container.
- Current DB user can restore into the existing `booklore` schema, but cannot create a new schema.
- The safest design is an admin-only maintenance workflow that freezes writes and pauses background workers during backup/restore.

## 2) What Was Verified

### 2.1 Application and database setup

- App and DB are dockerized in `docker-compose.yml`.
- API datasource is MariaDB via Spring datasource config in `booklore-api/src/main/resources/application.yaml`.
- Flyway migrations are enabled and active.

### 2.2 Runtime checks performed

- Containers running: `booklore` and `mariadb` were up and healthy.
- Dump tool available: `/usr/bin/mariadb-dump` exists in DB container.
- Logical export probe succeeded using standard `mariadb-dump` options.
- Restore permission probe:
  - DB user can perform DDL/DML in existing schema (`booklore`).
  - DB user cannot `CREATE DATABASE` (expected with current grants).

### 2.3 DB grants observed

- `GRANT USAGE ON *.* TO 'booklore'@'%'`
- `GRANT ALL PRIVILEGES ON 'booklore'.* TO 'booklore'@'%'`

Implication: import into current schema is possible; import into a new temporary schema is not possible without elevated credentials.

## 3) Data Scope Clarification

Question asked: if DB import succeeds, are old Libraries, Shelves, Media Types recreated automatically?

Answer: Yes, assuming the restore is complete and from the expected app lineage.

Why:
- Libraries are persisted in DB (`LibraryEntity`, `LibraryPathEntity`).
- Shelves are persisted in DB (`ShelfEntity`, `MagicShelfEntity`).
- Custom Media Type label is persisted in `book.file_type` (`BookEntity`, migration `V133__Add_file_type_to_book.sql`).

Important caveat:
- DB restore does not restore the actual media files on disk.
- If new install paths differ from old paths, libraries may appear in UI but point to missing/offline directories until path correction and rescan.

## 4) Existing Settings Backup vs Full DB Backup

- App already has settings export/import endpoints in `AppSettingController` / `AppSettingService`.
- This settings transfer is not equivalent to full DB backup/restore.
- DB restore is much more sensitive and should use stricter controls.

## 5) Recommended "Maintenance Mode" Design

### 5.1 UX concept

- Admin UI button: `Database Backup`
- Admin UI button: `Database Restore`
- Both require admin re-auth confirmation (password prompt) and explicit risk acknowledgement.

### 5.2 Backend guardrail behavior

When maintenance starts:
- Set global maintenance flag.
- Block write endpoints (and ideally all non-admin API traffic) with clear maintenance response.
- Pause background processing and watchers (library watch, scheduler tasks, bookdrop monitors).

During operation:
- Run backup/restore server-side only.
- Never expose DB credentials in browser.
- Stream progress and log audit events.

When maintenance ends:
- Resume paused workers.
- Clear maintenance flag.
- Trigger optional post-restore validation and rescans.

## 6) MariaDB-Standard Methods

Preferred default:
- Export with `mariadb-dump` (logical backup):
  - `--single-transaction`
  - `--quick`
  - include routines/events only if needed
- Import with `mariadb` client into target schema.

Why this is best now:
- Portable, standard, works in current container setup, easiest to support for non-CLI admins.

Alternative for advanced ops:
- `mariabackup` for physical backups (better for large data / low downtime DR), but more operational complexity.

## 7) Security and Permission Risks

- Dump files are sensitive and can contain tokens, users, app settings, and internal data.
- Restore while app is active risks inconsistent state and lock contention.
- Current compose publishes port 3306 publicly; this broadens attack surface.
- Current DB user cannot create temporary schemas for staged restore validation.

Minimum controls recommended:
- Admin-only authorization
- Re-auth on each backup/restore action
- Audit log all operations
- Strict file storage permissions for backups
- Optional backup encryption at rest
- Consider reducing DB port exposure (internal-only or localhost bind)

## 8) Operational Sequence (New Install Scenario)

Given user scenario: new install -> restore settings -> restore DB -> wait for assets

Recommended sequence:
1. New install with correct volume/path mappings.
2. Enter maintenance mode.
3. Restore DB first.
4. Exit maintenance mode (or controlled resume).
5. Verify library paths; fix mismatches if host paths changed.
6. Trigger library rescans as needed.
7. Use settings import only when not doing a full DB restore or when specific overrides are intentional.

Reason:
- Full DB restore typically already includes settings, so settings-first can be redundant or overwritten.

## 9) Constraints and Open Decisions

- Decide whether restore supports only existing schema (current grants) or also temp-schema staging (requires elevated maintenance credential).
- Decide whether to expose this in main Settings UI or separate Admin Maintenance page.
- Decide whether maintenance mode blocks all users or only write actions.
- Decide backup retention policy and encryption policy.

## 10) Suggested Future Implementation Plan

Phase 1 (safe baseline):
- Admin-only backup/restore endpoints.
- Maintenance mode flag and write-block middleware.
- Re-auth requirement and audit logging.
- Logical dump/import workflow to existing schema.

Phase 2 (hardening):
- Backup metadata manifest (app version, DB version, timestamp, migration state).
- Integrity verification and checksum.
- Optional encrypted backup storage.
- Optional temp-schema validation path with elevated credential.

## 11) Final Feasibility Verdict

- Feasible now: yes (logical backup + restore to existing schema).
- Not feasible now with current DB user: create-and-restore to new temporary schema.
- Most practical and safe approach for non-CLI admins: admin-only maintenance mode workflow around standard MariaDB dump/import.
