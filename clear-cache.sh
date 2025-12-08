#!/bin/bash

echo "🧹 Cleaning all caches and build artifacts..."

# Clear npm cache
echo "📦 Clearing npm cache..."
npm cache clean --force

# Clear Vite cache and build output
echo "⚡ Clearing Vite cache..."
rm -rf node_modules/.vite
rm -rf .vite
rm -rf dist

# Clear any browser-specific caches if they exist
echo "🌐 Browser cache notes:"
echo "   - Clear browser cache: Ctrl+Shift+Delete (Chrome/Firefox)"
echo "   - Or use Incognito/Private window for testing"

echo ""
echo "✅ All caches cleared!"
echo ""
echo "Now you can run: npm run dev"

