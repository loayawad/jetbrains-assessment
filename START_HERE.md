# 🚀 START HERE - Distributed Scheduler Service

Welcome! This is a complete distributed scheduler service for the JetBrains technical assessment.

## ⚡ Quick Start (5 Minutes)

### Step 1: Start Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (database)
- Redis (distributed locks)
- Scheduler service

### Step 2: Initialize Database

```bash
docker-compose exec scheduler yarn migrate
```

### Step 3: Open the Application

```bash
open http://localhost:3000
```

Or visit: http://localhost:3000

**That's it!** You can now create schedules via the UI.

## 📖 Documentation Guide

Read in this order:

1. **START_HERE.md** (this file) - Quick start
2. **README.md** - Main documentation, API reference
3. **ARCHITECTURE.md** - System design deep dive
4. **TESTING.md** - How to test the system

Quick references:
- **QUICK_REFERENCE.md** - Cheat sheet for common tasks
- **SETUP.md** - Detailed setup instructions

## 🎯 What You'll Find

### ✅ Fully Implemented

- **REST API** - Complete CRUD for schedules
- **Cron Scheduling** - Standard cron expressions
- **Distributed Locking** - Redis-based exactly-once guarantee
- **Retry Logic** - Exponential backoff
- **Web UI** - Simple, functional interface
- **Horizontal Scaling** - Multiple instances supported
- **Docker Setup** - One command to start everything

### 📊 Key Features

```
┌─────────────────────────────────────────────────────┐
│                    Web Browser                       │
│              http://localhost:3000                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Scheduler Service (Node.js)             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │  REST API  │  │ Scheduler  │  │  Executor  │   │
│  └────────────┘  └────────────┘  └────────────┘   │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐    ┌───▼───┐    ┌────▼────┐
   │  Redis  │    │Postgres│    │ Agents  │
   │ (Locks) │    │  (DB)  │    │(External)│
   └─────────┘    └────────┘    └─────────┘
```

## 🧪 Quick Test

### Test 1: Create a Schedule (UI)

1. Open http://localhost:3000
2. Click "Create Schedule"
3. Fill in:
   - Name: "Test Schedule"
   - Cron: `*/2 * * * *` (every 2 minutes)
   - Agent ID: "test-001"
   - Agent URL: "https://httpbin.org/post"
4. Click "Save"
5. Wait 2-3 minutes
6. Click "History" to see executions

### Test 2: Create a Schedule (API)

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test",
    "cronExpression": "*/2 * * * *",
    "agentId": "api-001",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "enabled": true
  }'
```

### Test 3: Horizontal Scaling

```bash
# Start 2 scheduler instances
docker-compose --profile scale up -d

# Watch logs from both
docker-compose logs -f scheduler scheduler-2

# Create a schedule and observe only one instance executes
```

## 📁 Project Structure

```
jetbrains-assessment/
├── src/                    # TypeScript source
│   ├── api/               # REST endpoints
│   ├── services/          # Business logic
│   ├── repositories/      # Data access
│   └── db/                # Database
├── ui/                     # Web interface
├── docker-compose.yml      # Infrastructure
└── Documentation/          # All docs
```

## 🎓 Key Concepts

### 1. Exactly-Once Execution

```typescript
// Each fire time gets a unique lock key
const lockKey = `execution:${scheduleId}:${fireTime}`;

// Only one instance can acquire the lock
const acquired = await redis.set(lockKey, '1', { NX: true });

if (acquired) {
  // This instance executes
  await invokeAgent();
}
```

### 2. Retry Logic

```
Attempt 1: Wait 1s  → Fail
Attempt 2: Wait 2s  → Fail (exponential backoff)
Attempt 3: Wait 4s  → Fail
Status: FAILED (max attempts reached)
```

### 3. Cron Expressions

```
*/5 * * * *  = Every 5 minutes
0 9 * * *    = Daily at 9 AM
0 9 * * 1    = Every Monday at 9 AM
```

## 🔍 What to Look At

### For Code Quality

- `src/services/DistributedScheduler.ts` - Core scheduling logic
- `src/services/AgentExecutor.ts` - Retry implementation
- `src/services/RedisClient.ts` - Distributed locking
- `src/repositories/` - Clean data access layer

### For Architecture

- `ARCHITECTURE.md` - System design decisions
- `docker-compose.yml` - Infrastructure setup
- `src/index.ts` - Application bootstrap

### For Production Thinking

- Health checks (`/api/health`)
- Retry logic with exponential backoff
- Graceful shutdown handling
- Execution history tracking
- Error handling throughout

## 🛠️ Common Commands

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f scheduler

# Stop everything
docker-compose down

# Clean restart
docker-compose down -v && docker-compose up -d

# Run migrations
docker-compose exec scheduler yarn migrate

# Check health
curl http://localhost:3000/api/health
```

## ❓ FAQ

**Q: How do I test horizontal scaling?**  
A: Run `docker-compose --profile scale up -d` to start 2 instances.

**Q: Where are the execution logs?**  
A: View in UI (click "History" button) or via API: `/api/schedules/{id}/executions`

**Q: What if a schedule fails?**  
A: It will retry automatically based on the retry policy (default: 3 attempts with exponential backoff).

**Q: Can I run multiple instances?**  
A: Yes! Redis distributed locks ensure exactly-once execution.

**Q: How do I change the configuration?**  
A: Edit `.env` file or environment variables in `docker-compose.yml`.

## 🎯 Next Steps

1. ✅ Run the quick start above
2. 📖 Read **README.md** for API details
3. 🏗️ Read **ARCHITECTURE.md** for design decisions
4. 🧪 Follow **TESTING.md** for comprehensive testing

## 💡 Tips

- Use [crontab.guru](https://crontab.guru/) to test cron expressions
- Check logs with `docker-compose logs -f scheduler`
- Use httpbin.org for testing agent endpoints
- The UI auto-refreshes when you click "Refresh"

## 🆘 Troubleshooting

**Services won't start?**
```bash
docker-compose down -v
docker-compose up -d
```

**Database errors?**
```bash
docker-compose exec scheduler yarn migrate
```

**Port 3000 in use?**
```bash
# Change PORT in docker-compose.yml
```

## 📞 Questions?

All design decisions are documented in **ARCHITECTURE.md**.  
All testing procedures are in **TESTING.md**.  
Quick reference in **QUICK_REFERENCE.md**.

---