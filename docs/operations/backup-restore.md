# Backup and restore operations

PQRS Flow stores operational data in two locations: the SQLite database (`DB_PATH`) and uploaded files (`ATTACHMENTS_STORAGE_DIR`). A usable backup must contain both.

## Create a backup

Stop the application first so database writes and attachment uploads cannot race the backup. For Docker Compose:

```powershell
docker compose stop
npm run db:backup
docker compose start
```

The command creates a timestamped directory under `backups/` containing `pqrs.db`, `attachments/`, and `manifest.json`. The database is exported with `better-sqlite3`'s SQLite online-backup API, so committed WAL data is included in the database snapshot. The manifest records SHA-256 checksums for the database and every attachment. Keep the resulting directory in protected storage, separate from the machine hosting the application. Backups may contain personal and sensitive information; restrict access and encrypt them at rest using your organization's approved storage controls.

If the command fails, inspect the error and do not treat a partial directory as a valid backup. Restart the service after the command completes.

## Restore a backup

**Stop the application and ensure no other process has the database open. Restore replaces the current database and attachment directory.** Use an absolute path to the backup directory:

```powershell
docker compose stop
npm run db:restore -- "C:\path\to\pqrs-flow-2026-10-30T22-00-00-000Z"
docker compose start
docker compose ps
Invoke-RestMethod http://localhost:3000/api/health
```

The restore command checks the format version, database checksum, every attachment checksum, SQLite `integrity_check`, and foreign-key consistency before changing live data. It stages the restored files beside their destinations and attempts to roll back if replacement fails. Keep an independent copy of the current data before restoring. After startup, verify representative requests and their attachments through the application; an HTTP health response alone does not prove business data is correct.

For production, set `RESTORE_CONFIRM=YES` explicitly when running the restore command. Do not expose this confirmation through a public endpoint.

## Important limits

- The application must be stopped for a coordinated database-and-attachment backup and for restore.
- This is a local operational backup tool, not a scheduled backup service or remote replication system.
- The backup does not include `.env`, credentials, encryption keys, SMTP configuration, Docker volumes' metadata, or external infrastructure configuration. Preserve secrets separately using an approved secret manager. In particular, retain the same `MFA_ENCRYPTION_KEY`; without it, encrypted MFA secrets may become unreadable.
- A checksum detects accidental changes; it does not encrypt data or prove that a backup is trustworthy if an attacker can replace both files and manifest.
- Keep multiple generations and periodically perform a restore drill on an isolated environment.
- PQRS Flow remains a single-instance SQLite application. Do not run multiple application replicas against the same database.
