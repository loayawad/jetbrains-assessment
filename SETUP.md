# Setup Guide

## Quick Start (5 minutes)

### 1. Prerequisites Check

```bash
# Check Node.js version (18+)
node --version

# Check Docker
docker --version
docker-compose --version

# Check Yarn
yarn --version
```

If missing:
- **Node.js**: Download from [nodejs.org](https://nodejs.org/)
- **Docker**: Download from [docker.com](https://www.docker.com/get-started)
- **Yarn**: `npm install -g yarn`

### 2. Clone & Install

```bash
cd /path/to/jetbrains-assessment

# Install dependencies
yarn install
```

### 3. Start Services

```bash
# Start everything with Docker Compose
docker-compose up -d

# Wait for services to be ready (~30 seconds)
docker-compose logs -f
# Press Ctrl+C when you see "✅ Server running on port 3000"
```

### 4. Initialize Database

```bash
# Run migrations
docker-compose exec scheduler yarn migrate
```

### 5. Access the Application

- **Web UI**: http://localhost:3000
- **API**: http://localhost:3000/api/schedules
- **Health**: http://localhost:3000/api/health

## Development Setup

### Local Development (Without Docker)

```bash
# 1. Start PostgreSQL and Redis
docker-compose up -d postgres redis

# 2. Copy environment file
cp .env.example .env

# 3. Install dependencies
yarn install

# 4. Run migrations
yarn migrate

# 5. Start in development mode (hot reload)
yarn dev
```

The app will restart automatically when you edit files in `src/`.

### Using Make Commands

```bash
# View all available commands
make help

# Install dependencies
make install

# Start services
make start

# View logs
make logs

# Stop services
make stop

# Clean everything
make clean
```

## Testing the Setup

### 1. Health Check

```bash
curl http://localhost:3000/api/health
```

Expected output:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-01-16T...",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 2. Create a Test Schedule

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Schedule",
    "cronExpression": "*/2 * * * *",
    "agentId": "test-001",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "payload": {"test": true},
    "enabled": true
  }'
```

### 3. Verify Schedule Created

```bash
curl http://localhost:3000/api/schedules
```

### 4. Wait and Check Executions

Wait 2-3 minutes, then:

```bash
# Get schedule ID from previous response
SCHEDULE_ID="<your-schedule-id>"

curl http://localhost:3000/api/schedules/$SCHEDULE_ID/executions
```

You should see execution records!

## Horizontal Scaling Demo

### Start Multiple Instances

```bash
# Start 2 scheduler instances
docker-compose --profile scale up -d

# Verify both are running
docker-compose ps
```

You should see:
- `scheduler-service` (port 3000)
- `scheduler-service-2` (port 3001)

### Watch Both Instances

```bash
# In terminal 1
docker-compose logs -f scheduler

# In terminal 2
docker-compose logs -f scheduler-2
```

### Create a Frequent Schedule

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Frequency Test",
    "cronExpression": "* * * * *",
    "agentId": "hf-001",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "enabled": true
  }'
```

### Observe

Watch the logs - you'll see both instances detecting the schedule, but only one acquires the lock and executes:

```
scheduler-1 | [Scheduler] 🔥 Triggering execution for schedule High Frequency Test
scheduler-2 | [Scheduler] Lock already acquired by another instance
```

This demonstrates the exactly-once guarantee!

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change the port in .env
echo "PORT=3001" >> .env
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres

# Re-run migrations
docker-compose exec scheduler yarn migrate
```

### Redis Connection Failed

```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping
# Should return "PONG"

# Restart Redis
docker-compose restart redis
```

### Migrations Failed

```bash
# Drop and recreate database
docker-compose down -v
docker-compose up -d postgres
sleep 5
docker-compose exec scheduler yarn migrate
```

### Scheduler Not Triggering Executions

1. **Check schedule is enabled**:
   ```bash
   curl http://localhost:3000/api/schedules
   ```
   Look for `"enabled": true`

2. **Check cron expression is valid**:
   Use [crontab.guru](https://crontab.guru/) to validate

3. **Check scheduler logs**:
   ```bash
   docker-compose logs scheduler | grep "Triggering execution"
   ```

4. **Check system time** (cron uses UTC):
   ```bash
   docker-compose exec scheduler date
   ```

### Container Keeps Restarting

```bash
# Check logs for error
docker-compose logs scheduler

# Common issues:
# - Database not ready: Wait longer or check connection string
# - Redis not ready: Check REDIS_HOST in docker-compose.yml
# - Build failed: Try rebuilding
docker-compose build scheduler
```

## IDE Setup

### VS Code

Recommended extensions:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-azuretools.vscode-docker"
  ]
}
```

### WebStorm / IntelliJ IDEA

1. Open project folder
2. Right-click `docker-compose.yml` → Run
3. Configure Node.js interpreter (Settings → Languages → Node.js)
4. Enable ESLint (Settings → Languages → JavaScript → Code Quality Tools)

## Environment Variables Reference

Create `.env` file:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# PostgreSQL
POSTGRES_HOST=localhost          # Use 'postgres' in Docker
POSTGRES_PORT=5432
POSTGRES_DB=scheduler
POSTGRES_USER=scheduler
POSTGRES_PASSWORD=scheduler123

# Redis
REDIS_HOST=localhost             # Use 'redis' in Docker
REDIS_PORT=6379

# Scheduler Settings
SCHEDULER_TICK_INTERVAL=1000     # Check schedules every 1 second
LOCK_TTL=30000                   # Lock expires after 30 seconds

# Retry Settings (defaults for new schedules)
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_BASE=1000
```

## Next Steps

1. ✅ Setup complete! 
2. 📖 Read [README.md](README.md) for API reference
3. 🏗️ Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
4. 🎨 Open http://localhost:3000 and create your first schedule!

## Getting Help

If you encounter issues:

1. Check logs: `docker-compose logs`
2. Check health: `curl http://localhost:3000/api/health`
3. Try clean restart: `make clean && make start`

---

**Setup Time**: ~5 minutes  
**Tested On**: macOS, Linux, Windows (WSL2)
