Place a compatible Linux `rar` binary in this directory as `rar` if you want
BookLore to preserve `.cbr` files during embedded metadata writes.

Runtime behavior:
- `docker-compose.yml` mounts this directory into the container at `/opt/booklore-rar`.
- `entrypoint.sh` automatically exports `BOOKLORE_RAR_BIN=/opt/booklore-rar/rar`
  when that file exists and is executable.
- If no binary is present, BookLore keeps the existing fallback path and may
  convert `.cbr` files to `.cbz` during metadata persistence.

Requirements:
- The binary must be executable.
- The binary must be compatible with the container architecture.
- Do not rename it; the auto-detected path is `/opt/booklore-rar/rar`.