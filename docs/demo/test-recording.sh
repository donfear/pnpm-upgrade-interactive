#!/bin/bash

# Test script for verifying the demo setup works
# Run this from the project root: bash docs/demo/test-recording.sh

set -e

echo "🎬 Testing demo recording setup..."
echo ""

# Check if VHS is installed
if ! command -v vhs &> /dev/null; then
    echo "❌ VHS is not installed."
    echo "   Install with: brew install vhs"
    exit 1
fi
echo "✅ VHS is installed"

# Check if demo project exists
if [ ! -d "docs/demo-project" ]; then
    echo "❌ Demo project directory not found"
    exit 1
fi
echo "✅ Demo project exists"

# Check if demo project has package.json
if [ ! -f "docs/demo-project/package.json" ]; then
    echo "❌ Demo project package.json not found"
    exit 1
fi
echo "✅ Demo project package.json exists"

# Build the CLI
echo ""
echo "🔨 Building CLI..."
pnpm build

# Check if dist/cli.js exists
if [ ! -f "dist/cli.js" ]; then
    echo "❌ Built CLI not found at dist/cli.js"
    exit 1
fi
echo "✅ CLI built successfully"

# Check if tape file exists
if [ ! -f "docs/demo/demo-real.tape" ]; then
    echo "❌ Tape file not found"
    exit 1
fi
echo "✅ Tape file exists"

# Optional: Test run the CLI manually
echo ""
echo "Would you like to test run the CLI manually? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Running CLI in demo project..."
    echo "   (Press Escape or Ctrl+C to exit)"
    cd docs/demo-project
    node ../../dist/cli.js
    cd ../..
fi

echo ""
echo "✅ All checks passed!"
echo ""
echo "To record the demo:"
echo "  pnpm demo:record"
echo ""
echo "Or run VHS directly:"
echo "  vhs docs/demo/demo-real.tape"
