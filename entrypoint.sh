#!/bin/sh
set -e

USER_ID="${USER_ID:-1000}"
GROUP_ID="${GROUP_ID:-1000}"
AUTO_RAR_BIN="/opt/booklore-rar/rar"

# Create group and user if they don't exist
if ! getent group "$GROUP_ID" >/dev/null 2>&1; then
    addgroup -g "$GROUP_ID" -S booklore
fi
if ! getent passwd "$USER_ID" >/dev/null 2>&1; then
    adduser -u "$USER_ID" -G "$(getent group "$GROUP_ID" | cut -d: -f1)" -S -D booklore
fi

# Ensure data and bookdrop directories exist and are writable by the target user
mkdir -p /app/data /bookdrop
chown "$USER_ID:$GROUP_ID" /app/data /bookdrop 2>/dev/null || true

# Auto-detect an optional mounted rar binary so CBR metadata writes can stay in-place.
if [ -z "${BOOKLORE_RAR_BIN:-}" ] && [ -x "$AUTO_RAR_BIN" ]; then
    export BOOKLORE_RAR_BIN="$AUTO_RAR_BIN"
fi

exec su-exec "$USER_ID:$GROUP_ID" "$@"
