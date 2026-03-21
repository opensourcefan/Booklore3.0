# DB Backup / Restore — Quick Reference

## Is it feasible?
**Yes.** Logical export works now. Restore to existing schema works. Restore to a NEW schema does not (DB user lacks CREATE DATABASE).

---

## What gets restored by a full DB import?
| Data | In DB? | Restored? |
|---|---|---|
| Libraries + paths | Yes | Yes (paths must match host filesystem) |
| Shelves (manual + magic) | Yes | Yes |
| Custom Media Types (`file_type`) | Yes (V133 migration) | Yes |
| Books + metadata | Yes | Yes |
| App settings | Yes | Yes |
| **Actual media files on disk** | **No** | **No** |

> Caveat: if host paths changed, libraries appear offline until corrected + rescan.

---

## Current DB user grants
```
GRANT USAGE ON *.*
GRANT ALL PRIVILEGES ON booklore.*
```
✅ Can dump + restore inside `booklore` schema  
❌ Cannot CREATE new/temp schema for staged validation

---

## Preferred export command (inside container)
```bash
mariadb-dump \
  --single-transaction \
  --quick \
  --no-tablespaces \
  -u booklore -p \
  booklore > booklore_backup.sql
```

## Preferred import command (inside container)
```bash
mariadb -u booklore -p booklore < booklore_backup.sql
```

---

## Maintenance mode sequence (new install restore)
1. New install with **correct volume/path mappings**
2. Enter maintenance mode (freeze writes, pause watchers)
3. **Restore DB first**
4. Exit maintenance mode
5. Verify library paths — fix mismatches if paths changed
6. Trigger library rescans as needed
7. Use settings import only for targeted overrides (full DB restore already includes settings)

---

## Settings export ≠ DB backup
- `/api/v1/settings/export` — app settings only (`AppSettingKey` enum values)
- Full DB backup — everything (libraries, books, shelves, users, settings)
- They are separate operations with different scopes

---

## Security checklist
- [ ] Admin-only endpoints (`@PreAuthorize("@securityUtil.isAdmin()")`)
- [ ] Re-auth confirmation before each backup/restore action
- [ ] Audit log all operations (follow `AuditService` pattern)
- [ ] Strict file permissions on dump files
- [ ] Consider port 3306 internal-only (currently publicly exposed in compose)
- [ ] Encrypt backups at rest (Phase 2)

---

## Implementation entry points
| What | Where |
|---|---|
| Add backup/restore endpoints | `AppSettingController.java` |
| Maintenance mode flag | New middleware / `AppSettingService` |
| Pause/resume file watchers | `LibraryWatchService.java` |
| Pause/resume bookdrop | `BookdropMonitoringService.java` (already has pause/resume) |
| Pause scheduled tasks | `TaskService.java` |
| Audit logging | `AuditService` (existing pattern) |

---

## Phased plan
**Phase 1 (baseline)**
- Admin backup/restore endpoints
- Maintenance mode with write-block
- Re-auth + audit logging
- Logical dump/import to existing schema

**Phase 2 (hardening)**
- Backup manifest (version, timestamp, migration state)
- Checksum / integrity verification
- Encrypted backup storage
- Temp-schema staging with elevated credential (optional)

---

Full research: [database-backup-restore-maintenance-research-2026-03-21.md](database-backup-restore-maintenance-research-2026-03-21.md)
