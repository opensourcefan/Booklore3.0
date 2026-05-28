#!/bin/bash

# Ensure we stop on errors
set -e

echo "Starting stable release process..."

# Ensure our local repo is up to date
echo "Fetching latest changes from origin..."
git fetch origin

# Checkout master and make sure it's up to date
echo "Checking out master..."
git checkout master
git pull origin master

# Merge develop into master (forcing a merge commit)
echo "Merging develop into master..."
git merge origin/develop --no-ff -m "chore: merge develop into master for stable release"

# Push the updated master branch
echo "Pushing master to origin..."
git push origin master

# Update the 'stable' tag to point to the new master
echo "Updating the 'stable' tag..."
git tag -f stable
git push origin stable --force

# Switch back to develop
echo "Switching back to develop branch..."
git checkout develop

echo "✅ Successfully merged develop into master and updated the 'stable' designation!"
