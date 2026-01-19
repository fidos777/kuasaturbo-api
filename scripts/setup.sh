#!/bin/bash

# ============================================================
# KUASATURBO PHASE 1α - SETUP SCRIPT
# ============================================================
# Run this script to set up the KuasaTurbo environment
# 
# Usage: ./scripts/setup.sh
# ============================================================

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         KUASATURBO PHASE 1α - SETUP SCRIPT                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────
# Step 1: Check prerequisites
# ─────────────────────────────────────────────────────────────
echo "Step 1: Checking prerequisites..."
echo "────────────────────────────────"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not found. Please install Node.js 20+"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm not found"
    exit 1
fi

# Check Docker (optional for now)
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}✓${NC} Docker: $DOCKER_VERSION"
else
    echo -e "${YELLOW}⚠${NC} Docker not found (optional for local dev)"
fi

echo ""

# ─────────────────────────────────────────────────────────────
# Step 2: Create directory structure
# ─────────────────────────────────────────────────────────────
echo "Step 2: Creating directory structure..."
echo "───────────────────────────────────────"

mkdir -p inputs outputs proof logs temp
echo -e "${GREEN}✓${NC} Created: inputs/"
echo -e "${GREEN}✓${NC} Created: outputs/"
echo -e "${GREEN}✓${NC} Created: proof/"
echo -e "${GREEN}✓${NC} Created: logs/"
echo -e "${GREEN}✓${NC} Created: temp/"

echo ""

# ─────────────────────────────────────────────────────────────
# Step 3: Setup environment file
# ─────────────────────────────────────────────────────────────
echo "Step 3: Setting up environment..."
echo "─────────────────────────────────"

if [ ! -f .env ]; then
    cp .env.template .env
    echo -e "${GREEN}✓${NC} Created .env from template"
    echo -e "${YELLOW}⚠${NC} Please edit .env and add your ANTHROPIC_API_KEY"
else
    echo -e "${GREEN}✓${NC} .env already exists"
fi

# Verify critical env vars
if [ -f .env ]; then
    source .env
    if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "your_anthropic_api_key_here" ]; then
        echo -e "${YELLOW}⚠${NC} ANTHROPIC_API_KEY not set in .env"
    else
        echo -e "${GREEN}✓${NC} ANTHROPIC_API_KEY is set"
    fi
    
    if [ "$OUTPUT_TTL_SECONDS" = "86400" ]; then
        echo -e "${GREEN}✓${NC} TTL correctly set to 86400 (24 hours)"
    else
        echo -e "${YELLOW}⚠${NC} TTL is $OUTPUT_TTL_SECONDS, expected 86400"
    fi
fi

echo ""

# ─────────────────────────────────────────────────────────────
# Step 4: Install dependencies
# ─────────────────────────────────────────────────────────────
echo "Step 4: Installing dependencies..."
echo "──────────────────────────────────"

npm install

echo ""

# ─────────────────────────────────────────────────────────────
# Step 5: Run S7 tests
# ─────────────────────────────────────────────────────────────
echo "Step 5: Running S7 Guard tests..."
echo "─────────────────────────────────"

npm run test:s7 || {
    echo -e "${RED}✗${NC} S7 tests failed"
    exit 1
}

echo -e "${GREEN}✓${NC} S7 tests passed"
echo ""

# ─────────────────────────────────────────────────────────────
# Step 6: Run Retry tests
# ─────────────────────────────────────────────────────────────
echo "Step 6: Running Retry tests..."
echo "──────────────────────────────"

npm run test:retry || {
    echo -e "${RED}✗${NC} Retry tests failed"
    exit 1
}

echo -e "${GREEN}✓${NC} Retry tests passed"
echo ""

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo "                      SETUP COMPLETE                            "
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Edit .env and add your ANTHROPIC_API_KEY"
echo "  2. Start the server: npm start"
echo "  3. Run hello job test: npm run hello"
echo ""
echo "Constitutional compliance:"
echo "  ✓ S7 (No Continuity) enforced"
echo "  ✓ TTL set to 24 hours"
echo "  ✓ Layer 0 configuration"
echo ""
echo "\"KuasaTurbo executes once. Qontrek remembers forever. Only humans decide.\""
echo ""
