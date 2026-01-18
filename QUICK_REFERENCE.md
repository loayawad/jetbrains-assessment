# Quick Reference Card

## 🚀 Common Commands

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

# Scale to 2 instances
docker-compose --profile scale up -d
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/schedules` | List all schedules |
| `GET` | `/api/schedules/:id` | Get schedule by ID |
| `POST` | `/api/schedules` | Create schedule |
| `PUT` | `/api/schedules/:id` | Update schedule |
| `DELETE` | `/api/schedules/:id` | Delete schedule |
| `GET` | `/api/schedules/:id/executions` | Get execution history |

## 📝 Create Schedule Example

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Schedule",
    "cronExpression": "*/5 * * * *",
    "agentId": "agent-001",
    "agentUrl": "https://example.com/api/agent",
    "httpMethod": "POST",
    "headers": {"Authorization": "Bearer token"},
    "payload": {"key": "value"},
    "enabled": true
  }'
```

## ⏰ Cron Expression Cheat Sheet

| Expression | Meaning |
|------------|---------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Daily at 9 AM |
| `0 9 * * 1` | Every Monday at 9 AM |
| `0 0 1 * *` | First day of month |
| `*/15 9-17 * * 1-5` | Every 15 min, 9-5, Mon-Fri |

Format: `minute hour day month weekday`

## 🔧 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `SCHEDULER_TICK_INTERVAL` | 1000 | Check interval (ms) |
| `LOCK_TTL` | 30000 | Lock expiry (ms) |
| `MAX_RETRY_ATTEMPTS` | 3 | Default max retries |

## 🏗️ Architecture at a Glance

```
┌─────────────┐
│   Web UI    │
└──────┬──────┘
       │
┌──────▼──────┐     ┌─────────┐     ┌──────────┐
│  Scheduler  │────▶│  Redis  │     │PostgreSQL│
│  (Node.js)  │     │ (Locks) │     │   (DB)   │
└──────┬──────┘     └─────────┘     └────┬─────┘
       │                                   │
       └───────────────────────────────────┘
```

**Key Concepts**:
- **Distributed Locking**: Redis ensures exactly-once execution
- **Horizontal Scaling**: Run multiple instances safely
- **Retry Logic**: Exponential backoff on failures
- **Cron Scheduling**: Standard cron expressions

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3000 in use | Change `PORT` in `.env` |
| DB connection failed | `docker-compose restart postgres` |
| Redis connection failed | `docker-compose restart redis` |
| Schedules not firing | Check cron expression, verify enabled |
| Duplicate executions | Check Redis is running |

## 📊 Monitoring

```bash
# Health check
curl http://localhost:3000/api/health

# Check executions
curl http://localhost:3000/api/schedules/{id}/executions | jq

# Watch logs
docker-compose logs -f scheduler | grep "Triggering execution"

# Container stats
docker stats scheduler-service
```

## 🧪 Testing

### Unit Tests (74 tests)
```bash
yarn test                    # Run all tests
yarn test:watch              # Watch mode
yarn test:coverage           # Coverage report
```

**Test Coverage:**
- AgentExecutor (8 tests)
- DistributedScheduler (12 tests)
- Repositories (27 tests)
- Validation (26 tests)

### Manual Integration Test
```bash
# 1. Create test schedule (fires every 2 minutes)
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "cronExpression": "*/2 * * * *",
    "agentId": "test-001",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "enabled": true
  }'

# 2. Get schedule ID from response
SCHEDULE_ID="<paste-id-here>"

# 3. Wait 2-3 minutes

# 4. Check executions
curl http://localhost:3000/api/schedules/$SCHEDULE_ID/executions | jq
```

## 📁 Project Structure

```
src/
├── api/              # REST endpoints
├── services/         # Business logic
│   ├── DistributedScheduler.ts
│   ├── AgentExecutor.ts
│   └── RedisClient.ts
├── repositories/     # Data access
├── db/               # Database
└── types/            # TypeScript types

ui/                   # Web interface
docker-compose.yml    # Infrastructure
```

## 🔐 Production Checklist

- [ ] Add authentication/authorization
- [ ] Enable HTTPS
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure log aggregation
- [ ] Set up alerting
- [ ] Implement rate limiting
- [ ] Add secrets management
- [ ] Configure backups
- [ ] Set up CI/CD
- [ ] Load testing

## 📚 Documentation

- **README.md** - Overview & API reference
- **SETUP.md** - Installation guide
- **ARCHITECTURE.md** - System design deep dive
- **TESTING.md** - Testing procedures
- **QUICK_REFERENCE.md** - This file!

## 🆘 Getting Help

1. Check logs: `docker-compose logs`
2. Verify health: `curl http://localhost:3000/api/health`
3. Review documentation
4. Try clean restart: `make clean && make start`

---

**Quick Start**: `docker-compose up -d` → Open http://localhost:3000  
**Time to First Schedule**: < 5 minutes
