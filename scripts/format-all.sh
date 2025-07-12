#!/usr/bin/env bash

# Format all files in the monorepo
echo "Formatting all files in the monorepo..."
pnpm prettier --write "**/*.{ts,tsx,md,js,jsx,json,css}" --ignore-unknown

echo "Done!"
