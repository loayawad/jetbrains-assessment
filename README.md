# Distributed Scheduler Service

A production-ready, horizontally scalable scheduler service for triggering agent executions based on configurable cron schedules. Built with TypeScript, PostgreSQL, and Redis.

## 🏗️ Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer (Optional)                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
         ┌──────▼──────┐              ┌──────▼──────┐
         │ Scheduler   │              │ Scheduler   │
         │ Instance 1  │              │ Instance 2  │
         └──────┬──────┘              └──────┬──────┘
                │                             │
                └──────────────┬──────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
    │  Redis  │          │PostgreSQL│          │  Agents │
    │ (Locks) │          │   (DB)   │          │(External)│
    └─────────┘          └──────────┘          └─────────┘
```

### Key Design Decisions

1. **Distributed Locking with Redis**
   - Uses Redis `SET NX` with TTL for atomic lock acquisition
   - Lock key format: `execution:{scheduleId}:{fireTimeMs}`
   - Ensures exactly-once execution across multiple scheduler instances
   - Lock TTL (default 30s) prevents deadlocks from crashed instances

2. **Execution Model**
   - **Concurrent executions allowed** for different fire times
   - **Exactly-once guarantee** per scheduled fire time via distributed locks
   - Fire-and-forget async execution (non-blocking)
   - Schedule changes affect only future executions

3. **Retry Strategy**
   - Exponential backoff with configurable parameters
   - Retry on HTTP 5xx, timeouts, and network errors
   - Configurable per schedule

4. **Horizontal Scalability**
   - Multiple scheduler instances can run simultaneously
   - Coordination via Redis distributed locks
   - Each instance independently checks schedules
   - Race conditions resolved at lock acquisition

## 🧪 Testing

### Run Unit Tests

The project includes comprehensive unit tests for all core components:

```bash
# Run all tests
yarn run test
```

**Test Coverage:**
- ✅ **AgentExecutor** (8 tests): Execution logic, retry mechanism, exponential backoff, error handling
- ✅ **DistributedScheduler** (12 tests): Distributed locking, schedule checking, lifecycle management
- ✅ **ScheduleRepository** (14 tests): CRUD operations, query handling
- ✅ **ExecutionRepository** (13 tests): Execution tracking, status updates
- ✅ **Validation** (26 tests): Input validation, edge cases

**Total: 73 unit tests covering core architecture functionality**

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- Yarn package manager

### Option 1: Docker Compose (Recommended)

```bash
# Start all services (PostgreSQL, Redis, Scheduler)
make start

# Or without make:
docker-compose up -d

# View logs
make logs
```

The service will be available at:
- **Web UI**: http://localhost:3000
- **API**: http://localhost:3000/api/schedules
- **Health Check**: http://localhost:3000/api/health

### Option 2: Local Development

```bash
# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env

# Start PostgreSQL and Redis (via Docker)
docker-compose up -d postgres redis

# Run migrations
yarn migrate

# Start in development mode (with hot reload)
yarn dev
```

## 📦 Deployment Options

### Single Instance

```bash
docker-compose up -d
```

### Multiple Instances (Horizontal Scaling Demo)

```bash
# Start 2 scheduler instances
make start-scale

# Or:
docker-compose --profile scale up -d
```

This starts:
- `scheduler` on port 3000
- `scheduler-2` on port 3001

Both instances coordinate via Redis to ensure exactly-once execution.

### With Mock Agent (For Testing)

```bash
make start-test

# Or:
docker-compose --profile test up -d
```

This includes a mock HTTP agent at `http://mock-agent:5678`.

## 🔌 API Reference

### Create Schedule

```bash
POST /api/schedules
Content-Type: application/json

{
  "name": "Daily Report Agent",
  "cronExpression": "0 9 * * *",
  "agentId": "report-agent-001",
  "agentUrl": "https://example.com/api/agent",
  "httpMethod": "POST",
  "headers": {
    "Authorization": "Bearer token123"
  },
  "payload": {
    "reportType": "daily"
  },
  "retryPolicy": {
    "maxAttempts": 3,
    "backoffMultiplier": 2,
    "initialDelayMs": 1000,
    "maxDelayMs": 30000
  },
  "enabled": true
}
```

### Get All Schedules

```bash
GET /api/schedules
```

### Get Schedule by ID

```bash
GET /api/schedules/{id}
```

### Update Schedule

```bash
PUT /api/schedules/{id}
Content-Type: application/json

{
  "enabled": false
}
```

### Delete Schedule

```bash
DELETE /api/schedules/{id}
```

### Get Execution History

```bash
GET /api/schedules/{id}/executions?limit=50
```

## 🎯 Cron Expression Examples

| Expression | Description |
|------------|-------------|
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour at minute 0 |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `*/15 9-17 * * 1-5` | Every 15 min, 9AM-5PM, Mon-Fri |
| `0 0 1 * *` | First day of every month at midnight |

Use [crontab.guru](https://crontab.guru/) for testing cron expressions.

## 🔧 Configuration

Environment variables (see `.env.example`):

```bash
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=scheduler
POSTGRES_USER=scheduler
POSTGRES_PASSWORD=scheduler123

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Scheduler
SCHEDULER_TICK_INTERVAL=1000    # How often to check schedules (ms)
LOCK_TTL=30000                  # Lock time-to-live (ms)
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_BASE=1000
```

## 🧪 Testing

### Create a Test Schedule

```bash
make test

# Or manually:
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Schedule",
    "cronExpression": "*/2 * * * *",
    "agentId": "test-001",
    "agentUrl": "http://mock-agent:5678",
    "httpMethod": "POST",
    "enabled": true
  }'
```

### Verify Horizontal Scaling

1. Start multiple instances: `make start-scale`
2. Create a schedule that runs every minute
3. Watch logs from both instances:
   ```bash
   docker-compose logs -f scheduler scheduler-2
   ```
4. Observe that only one instance acquires the lock and executes

### Check Health

```bash
curl http://localhost:3000/api/health
```

## 📊 Database Schema

### Schedules Table

```sql
CREATE TABLE schedules (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cron_expression VARCHAR(255) NOT NULL,
    agent_id VARCHAR(255) NOT NULL,
    agent_url TEXT NOT NULL,
    http_method VARCHAR(10) NOT NULL DEFAULT 'POST',
    headers JSONB,
    payload JSONB,
    retry_policy JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Executions Table

```sql
CREATE TABLE executions (
    id UUID PRIMARY KEY,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    fire_time TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error TEXT,
    response JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 🏗️ Project Structure

```
.
├── src/
│   ├── api/              # REST API routes
│   │   ├── schedules.ts  # Schedule CRUD endpoints
│   │   └── health.ts     # Health check endpoint
│   ├── db/               # Database layer
│   │   ├── client.ts     # PostgreSQL connection pool
│   │   ├── schema.sql    # Database schema
│   │   └── migrate.ts    # Migration runner
│   ├── repositories/     # Data access layer
│   │   ├── ScheduleRepository.ts
│   │   └── ExecutionRepository.ts
│   ├── services/         # Business logic
│   │   ├── DistributedScheduler.ts  # Core scheduler
│   │   ├── AgentExecutor.ts         # Agent invocation & retry
│   │   └── RedisClient.ts           # Redis lock manager
│   ├── types/            # TypeScript interfaces
│   │   └── index.ts
│   ├── utils/            # Utilities
│   │   └── validation.ts # Request validation (Zod)
│   ├── config/           # Configuration
│   │   └── index.ts
│   └── index.ts          # Application entry point
├── ui/                   # Web UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── docker-compose.yml
├── Dockerfile
├── Makefile
└── README.md
```

## 🔒 Production Considerations

### What's Implemented

✅ **Horizontal Scalability**
- Multiple instances coordinate via Redis locks
- Tested with 2+ instances

✅ **Exactly-Once Execution**
- Distributed locking prevents duplicate executions
- Unique execution key per schedule + fire time

✅ **Retry Logic**
- Exponential backoff
- Configurable per schedule
- Tracks attempts and errors

✅ **Data Persistence**
- PostgreSQL for schedules and execution history
- Survives restarts

✅ **Health Checks**
- Database connectivity
- Redis connectivity

✅ **Web UI**
- CRUD operations for schedules
- Execution history view

### What Would Be Added for Full Production

**Security** 🔐
- [ ] Authentication & Authorization (JWT, API keys)
- [ ] HTTPS/TLS termination
- [ ] Input sanitization (XSS protection)
- [ ] Rate limiting per user/API key
- [ ] Secrets management (HashiCorp Vault, AWS Secrets Manager)

**Observability** 📈
- [ ] Structured logging (Winston, Pino)
- [ ] Metrics (Prometheus + Grafana)
  - Execution success/failure rates
  - Lock acquisition metrics
  - Queue depth
  - Execution latency
- [ ] Distributed tracing (Jaeger, OpenTelemetry)
- [ ] Alerting (PagerDuty, Slack)

**Resilience** 💪
- [ ] Circuit breaker for agent calls (Hystrix pattern)
- [ ] Dead letter queue for permanently failed executions
- [ ] Graceful degradation (continue despite Redis failures)
- [ ] Connection pooling tuning
- [ ] Resource limits (max concurrent executions)

**Data Management** 📊
- [ ] Execution history archival/cleanup
- [ ] Database connection pooling optimization
- [ ] Read replicas for query performance
- [ ] Backup & disaster recovery

**Advanced Features** ⚡
- [ ] Schedule versioning (track changes)
- [ ] Manual trigger API
- [ ] Pause/resume schedules
- [ ] Schedule dependencies (DAG)
- [ ] Webhooks for execution events
- [ ] Multi-tenancy support
- [ ] Schedule templates
- [ ] Time zone support (currently UTC only)

**Testing** 🧪
- [ ] Unit tests (Jest)
- [ ] Integration tests
- [ ] Load testing (k6, Artillery)
- [ ] Chaos engineering (deliberately fail nodes)

**DevOps** 🚀
- [ ] CI/CD pipeline (GitHub Actions, GitLab CI)
- [ ] Kubernetes deployment manifests
- [ ] Helm charts
- [ ] Infrastructure as Code (Terraform)
- [ ] Auto-scaling based on load
- [ ] Blue-green deployment

## 🐛 Troubleshooting

### Scheduler not firing executions

1. Check if schedules are enabled:
   ```bash
   curl http://localhost:3000/api/schedules
   ```

2. Check scheduler logs:
   ```bash
   docker-compose logs scheduler
   ```

3. Verify Redis connection:
   ```bash
   docker-compose exec redis redis-cli ping
   ```

### Database connection errors

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connectivity
docker-compose exec postgres pg_isready -U scheduler

# Re-run migrations
docker-compose exec scheduler yarn migrate
```

### Lock acquisition failures

- Check Redis is running: `docker-compose ps redis`
- Verify no long-running locks (check TTL)
- Increase `LOCK_TTL` if needed

## 📚 Technical Decisions & Rationale

### Why Redis for Distributed Locks?

- **Atomic operations**: `SET NX` is atomic
- **TTL support**: Automatic lock expiry prevents deadlocks
- **Performance**: In-memory, sub-millisecond latency
- **Industry standard**: Widely used pattern (Redlock)

**Alternative considered**: Database-based locks (PostgreSQL advisory locks)
- Pros: One less service
- Cons: Higher latency, doesn't scale as well

### Why PostgreSQL?

- **ACID guarantees**: Critical for schedule/execution data
- **Rich querying**: Execution history queries with filters
- **JSON support**: Flexible payload/headers storage
- **Mature ecosystem**: Well-understood, production-tested

### Why Fire-and-Forget Execution?

Executions run asynchronously after lock acquisition to avoid blocking the scheduler tick. This ensures:
- Scheduler remains responsive
- Long-running agents don't block other schedules
- Can handle high schedule volume

**Trade-off**: Harder to test synchronously, but better for production.

### Why Cron Parser Library?

Using `cron-parser` instead of implementing from scratch:
- Battle-tested parsing logic
- Handles edge cases (leap years, DST)
- Standard cron format compatibility
- Focus on business logic

## 📝 License

MIT

## 👤 Author

Loay Awad
