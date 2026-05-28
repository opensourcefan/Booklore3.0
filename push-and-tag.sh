#!/bin/bash
set -e

echo "Pushing local commits to origin/develop..."
# Pushes the currently checked-out branch's commits directly to the 'develop' branch on the remote
git push origin HEAD:develop

echo "Fetching latest tags from origin..."
git fetch --tags origin

# Find the most recent tag formatted as vX.Y.Z (ignoring pre-releases or other tags)
latest_tag=$(git tag --list --sort=-v:refname | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1)

if [ -z "$latest_tag" ]; then
    echo "No valid tags found. Starting from v0.0.0"
    latest_tag="v0.0.0"
fi

echo "Latest tag found: $latest_tag"

# Remove the 'v' prefix
version="${latest_tag#v}"

# Split into major, minor, patch
IFS='.' read -r major minor patch <<< "$version"

# Increment the least significant digit (patch)
patch=$((patch + 1))

# Reconstruct the tag
new_tag="v${major}.${minor}.${patch}"

echo "Creating new tag: $new_tag"
git tag "$new_tag"

echo "Pushing new tag to origin..."
git push origin "$new_tag"

echo "✅ Successfully pushed code to develop and released tag $new_tag!"
