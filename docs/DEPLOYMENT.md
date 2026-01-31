# Deployment Guide

Production deployment guide covering Docker, CI/CD, and cloud deployment options.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Production Build](#local-production-build)
- [Docker Deployment](#docker-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [Environment Configuration](#environment-configuration)

---

## Prerequisites

### Required Services

- **Redis Server** - For conversation caching
- **Database** - SQLite (default) or PostgreSQL/Supabase
- **Node.js 18+** - Runtime environment

### Required API Keys

```bash
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
APP_TOKEN=
OPENAI_API_KEY=
GEMINI_API_KEY=
LEAP_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

### Slack App Configuration

1. Create Slack App at https://api.slack.com/apps
2. Enable Socket Mode
3. Add Bot Token Scopes:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`
4. Generate App-Level Token with `connections:write`
5. Install app to workspace

---

## Local Production Build

### Build Application

```bash
# Clean previous build
rm -rf build/

# Compile TypeScript
npm run build

# Verify build
ls -la build/

# Test production build
NODE_ENV=production node build/index.js
```

### Production Start Script

```bash
# Start with PM2
npm install -g pm2
pm2 start build/index.js --name slack-bot

# Or use npm start
npm start
```

---

## Docker Deployment

### Build Docker Image

**Method 1: Using build script**

```bash
# Build application first
npm run build

# Build Docker image
./build-docker.sh
```

**Method 2: Manual build**

```bash
# Build app
npm run build

# Build image with args
docker build \
  --build-arg SLACK_SIGNING_SECRET_ARG="$SLACK_SIGNING_SECRET" \
  --build-arg SLACK_BOT_TOKEN_ARG="$SLACK_BOT_TOKEN" \
  --build-arg APP_TOKEN_ARG="$APP_TOKEN" \
  --build-arg OPENAI_API_KEY_ARG="$OPENAI_API_KEY" \
  --build-arg GEMINI_API_KEY_ARG="$GEMINI_API_KEY" \
  --build-arg LEAP_API_KEY_ARG="$LEAP_API_KEY" \
  --build-arg VAPID_PUBLIC_KEY_ARG="$VAPID_PUBLIC_KEY" \
  --build-arg VAPID_PRIVATE_KEY_ARG="$VAPID_PRIVATE_KEY" \
  -t slack-bot:latest .
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  slack-bot:
    image: slack-bot:latest
    depends_on:
      - redis
    ports:
      - '4000:4000'
      - '3001:3001'
    volumes:
      - ./database:/database
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis://redis:6379
      - DB_URL=/database/database.sqlite
      - SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET}
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
      - APP_TOKEN=${APP_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - LEAP_API_KEY=${LEAP_API_KEY}
      - VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
      - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
    restart: unless-stopped

volumes:
  redis-data:
```

**Run with Docker Compose:**

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f slack-bot

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

### Run Docker Container

**Basic run:**

```bash
docker run -d \
  --name slack-bot \
  -p 4000:4000 \
  -p 3001:3001 \
  -v $(pwd)/database:/database \
  slack-bot:latest
```

**With Redis on host:**

```bash
docker run -d \
  --name slack-bot \
  -p 4000:4000 \
  -p 3001:3001 \
  --add-host=host.docker.internal:host-gateway \
  -e REDIS_HOST=redis://host.docker.internal:6379 \
  -v $(pwd)/database:/database \
  slack-bot:latest
```

**Full configuration:**

```bash
docker run -d \
  --name slack-bot \
  --restart unless-stopped \
  -p 4000:4000 \
  -p 3001:3001 \
  --add-host=host.docker.internal:host-gateway \
  -e NODE_ENV=production \
  -e REDIS_HOST=redis://host.docker.internal:6379 \
  -e SLACK_SIGNING_SECRET="$SLACK_SIGNING_SECRET" \
  -e SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" \
  -e APP_TOKEN="$APP_TOKEN" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -v $(pwd)/database:/database \
  slack-bot:latest
```

### Docker Commands

```bash
# View logs
docker logs -f slack-bot

# Restart container
docker restart slack-bot

# Stop container
docker stop slack-bot

# Remove container
docker rm slack-bot

# Execute command in container
docker exec -it slack-bot sh

# View resource usage
docker stats slack-bot
```

---

## CI/CD Pipeline

### GitHub Actions

Project includes CI/CD workflow at `.github/workflows/main.yml`.

**Pipeline stages:**

1. **Build** - Install dependencies, verify build
2. **Deploy** - SSH to server, pull, build, restart Docker

**Configuration:**

Set GitHub Secrets:

- `SSH_HOST` - Server IP/hostname
- `SSH_USERNAME` - SSH user
- `SSH_PASSWORD` - SSH password (or use SSH key)

**Manual deployment:**

```bash
# Build and push to server
git push origin main

# Or trigger manually via GitHub Actions UI
```

### Manual Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Pull latest changes
git pull origin main

# Build application
echo "📦 Building application..."
npm ci
npm run build

# Build Docker image
echo "🐳 Building Docker image..."
./build-docker.sh

# Stop and remove old container
echo "🛑 Stopping old container..."
docker stop slack-bot || true
docker rm slack-bot || true

# Start new container
echo "▶️  Starting new container..."
./run-docker.sh

echo "✅ Deployment complete!"
```

Make executable:

```bash
chmod +x deploy.sh
```

### Rollback Strategy

```bash
# Tag current version before deploy
git tag -a v1.0.0 -m "Release 1.0.0"

# Rollback to previous version
git checkout v0.9.0
./deploy.sh

# Or rollback Docker image
docker pull slack-bot:v0.9.0
docker run -d --name slack-bot slack-bot:v0.9.0
```

---

## Environment Configuration

### Production Environment Variables

```bash
# Required
NODE_ENV=production

# Slack (required)
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
APP_TOKEN=

# AI Services (at least one required)
OPENAI_API_KEY=
GEMINI_API_KEY=

# Optional services
LEAP_API_KEY=
SEARCH_API_KEY=
SEARCH_API_KEY_CX=

# Database (optional, defaults to SQLite)
DB_URL=postgresql://user:pass@host:5432/db

# Redis (optional, defaults to localhost)
REDIS_HOST=redis://host:6379

# Web Push (required for notifications)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

### Generating VAPID Keys

```bash
# Install web-push CLI
npm install -g web-push

# Generate keys
web-push generate-vapid-keys
```

### Database Configuration

**SQLite (Default):**

```bash
DB_URL=/database/database.sqlite
```

**Supabase (API Auth):**

```bash
SUPABASE_URL=https://project.supabase.co
SUPABASE_TOKEN=your_token
```
