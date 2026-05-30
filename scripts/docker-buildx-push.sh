#!/bin/bash
set -euo pipefail

# =======================
# Multi-arch Docker Build & Push for Fable
# =======================

# Ensure a version/tag is passed
if [ -z "${1:-}" ]; then
  echo "ERROR: You must provide a version/tag as the first argument."
  echo "Usage: $0 <version-tag>"
  exit 1
fi

VERSION="$1"

echo "Building Fable App with multi-arch version: $VERSION"

# Ensure Docker Buildx builder exists and is used
docker buildx create --use --name multiarch-builder || true

# Build and push multi-arch Docker image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/opensourcefan/fable:"$VERSION" \
  --push \
  .

echo "Multi-arch Docker image ghcr.io/opensourcefan/fable:$VERSION pushed successfully!"