# ============================================================
# KUASATURBO PHASE 1α - DOCKERFILE
# ============================================================
# Constitutional AI Execution Substrate
# Layer 0: Execute once, no authority, no continuity
# ============================================================

FROM node:20-alpine AS base

# Labels
LABEL maintainer="Qontrek Team"
LABEL version="1.0.0-alpha"
LABEL description="KuasaTurbo Execution Substrate - Phase 1α"
LABEL layer="0"
LABEL constitutional.s7="enforced"

# Install system dependencies
RUN apk add --no-cache \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S kuasaturbo && \
    adduser -S kuasaturbo -u 1001 -G kuasaturbo

# --------------------------------------------------------
# DEPENDENCIES STAGE
# --------------------------------------------------------
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# --------------------------------------------------------
# BUILD STAGE
# --------------------------------------------------------
FROM base AS builder

COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript (if applicable)
RUN npm run build || echo "No build step defined"

# --------------------------------------------------------
# PRODUCTION STAGE
# --------------------------------------------------------
FROM base AS runner

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

# Create required directories
RUN mkdir -p /app/inputs /app/outputs /app/proof /app/temp /app/logs && \
    chown -R kuasaturbo:kuasaturbo /app

# Switch to non-root user
USER kuasaturbo

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start command
CMD ["node", "src/index.js"]
