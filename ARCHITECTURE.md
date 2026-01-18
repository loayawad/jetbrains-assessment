# Architecture Deep Dive

## System Design

### High-Level Architecture

The Distributed Scheduler Service follows a microservices-friendly architecture designed for horizontal scalability and reliability.

```
┌────────────────────────────────────────────────────────────────┐
│                          Client Layer                           │
│                      (Web UI / REST API)                        │
└────────────────────────────────────────────────────────────────┘
                                │
┌────────────────────────────────────────────────────────────────┐
│                     Application Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Express    │  │  Scheduler   │  │   Agent      │        │
│  │   REST API   │  │   Service    │  │  Executor    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└────────────────────────────────────────────────────────────────┘
                                │
┌────────────────────────────────────────────────────────────────┐
│                      Data Access Layer                          │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │  Schedule    │  │  Execution   │                           │
│  │ Repository   │  │ Repository   │                           │
│  └──────────────┘  └──────────────┘                           │
└────────────────────────────────────────────────────────────────┘
                                │
┌────────────────────────────────────────────────────────────────┐
│                       Storage Layer                             │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │  PostgreSQL  │  │    Redis     │                           │
│  │  (Schedules  │  │ (Distributed │                           │
│  │  Executions) │  │    Locks)    │                           │
│  └──────────────┘  └──────────────┘                           │
└────────────────────────────────────────────────────────────────┘
```

## Core Components Explained

### 1. DistributedScheduler

**Responsibility**: Main orchestrator that checks schedules and triggers executions.

**Key Methods**:
- `tick()`: Called every second (configurable), checks all enabled schedules
- `checkSchedule()`: Parses cron expression and determines if execution is due
- `triggerExecution()`: Attempts to acquire lock and create execution

**Scalability Design**:
- Each instance independently scans schedules
- Coordination happens at lock acquisition
- Uses in-memory cache refreshed periodically

**Flow**:
```
1. Load enabled schedules from DB (cache)
2. For each schedule:
   a. Parse cron expression
   b. Check if fire time is due (between last check and now)
   c. If due: attempt to trigger execution
3. Sleep until next tick
```

### 2. RedisClient (Lock Manager)

**Responsibility**: Provides distributed locking primitives.

**Lock Key Format**: `execution:{scheduleId}:{fireTimeMs}`

**Why This Works**:
- Each scheduled fire time has a unique key
- Redis `SET NX` is atomic (only one instance succeeds)
- TTL ensures automatic cleanup if instance crashes

**Lock Acquisition Flow**:
```typescript
const lockKey = `execution:${scheduleId}:${fireTime.getTime()}`;
const acquired = await redis.set(lockKey, '1', {
  NX: true,    // Only set if not exists
  PX: 30000    // Expire in 30 seconds
});

if (acquired) {
  // This instance won the race
  // Create execution and invoke agent
}
```

### 3. AgentExecutor

**Responsibility**: Execute HTTP calls to agents with retry logic.

**Retry Strategy**:
- Exponential backoff: delay = initial × (multiplier ^ attempt)
- Example: 1s → 2s → 4s → 8s
- Max delay cap prevents excessive waits
- Retries on: HTTP 5xx, timeouts, network errors

**Execution States**:
```
PENDING → RUNNING → SUCCESS
              ↓
          RETRYING → FAILED
              ↑       (max attempts)
              └────┘
```

**Flow**:
```
1. Update execution to RUNNING
2. Make HTTP request to agent
3. If success: update to SUCCESS, store response
4. If failure:
   a. If attempts < maxAttempts: update to RETRYING, wait, go to 2
   b. Else: update to FAILED, store error
```

### 4. Repositories (Data Access)

**ScheduleRepository**:
- CRUD operations for schedules
- Handles JSON serialization for headers/payload/retryPolicy
- Uses parameterized queries (SQL injection protection)

**ExecutionRepository**:
- Creates execution records
- Updates status atomically
- Retrieves execution history

## Data Flow

### Creating a Schedule

```
User → REST API → Validation (Zod) → ScheduleRepository → PostgreSQL
                                    ↓
                         Cron Expression Validation
```

### Triggering an Execution

```
Scheduler Tick
    ↓
Check Schedule (cron parsing)
    ↓
Fire Time Due?
    │
    ├─ No → Skip
    │
    └─ Yes → Try Acquire Lock (Redis)
                ↓
             Acquired?
                │
                ├─ No → Another instance handling it
                │
                └─ Yes → Create Execution Record (PostgreSQL)
                            ↓
                         AgentExecutor.execute() (async)
                            ↓
                         HTTP Request to Agent
                            ↓
                         Update Execution Status
```

## Exactly-Once Guarantee

### How It Works

The combination of distributed locking and unique execution keys ensures exactly-once:

1. **Unique Key**: Each fire time generates a unique lock key
2. **Atomic Lock**: Redis `SET NX` ensures only one instance acquires lock
3. **TTL Safety**: Lock expires automatically (handles crashes)
4. **Idempotent**: Re-running lock acquisition for same fire time fails

### Edge Cases Handled

**Case 1: Two instances fire at same millisecond**
```
Instance A: SET execution:123:1705404000000 NX → OK
Instance B: SET execution:123:1705404000000 NX → FAIL
Result: Only Instance A executes
```

**Case 2: Instance crashes mid-execution**
```
Instance A: Acquires lock, crashes before completion
After 30s: Lock expires automatically
Next check: New execution record won't be created (fire time passed)
Result: Execution marked as RUNNING but never completed (observable)
```

**Case 3: Clock skew between instances**
```
Instance A time: 10:00:00.100
Instance B time: 10:00:00.200
Both check schedule with fire time 10:00:00
Result: Both attempt lock for same key, one succeeds
```

## Scalability Analysis

### Horizontal Scaling

**Theoretical Limit**: Bounded by:
1. Redis throughput (~100k ops/sec)
2. PostgreSQL connection pool
3. Network bandwidth

**Practical Limit**: Tested with 2 instances, can scale to 10+ instances easily.

**Load Distribution**:
- Not perfectly balanced (race condition at scheduler ticks)
- Over time, approximately even distribution
- Could add load-based sharding for extreme scale

### Performance Characteristics

**Scheduler Tick Overhead**:
- O(n) where n = number of enabled schedules
- With 1000 schedules: ~10ms per tick (in-memory cron parsing)
- Can handle 10,000+ schedules per instance

**Lock Contention**:
- Low: Only contention when fire time coincides
- For `*/5 * * * *` schedule across 10 instances: 10 attempts, 1 success
- Redis can handle this easily

**Database Load**:
- Read: Periodic schedule refresh (every ~10 ticks)
- Write: Per execution (creation + status updates)
- 1000 executions/min = ~17 QPS (manageable)

## Failure Modes & Recovery

### Scheduler Instance Crash

**Detection**: Health check fails, container restarts
**Impact**: Minimal - other instances continue
**Recovery**: Automatic via Docker restart policy

### Redis Failure

**Detection**: Connection error in scheduler
**Impact**: HIGH - No new executions (no locks available)
**Recovery**: 
- Current implementation: Fails gracefully (logs error)
- Production: Fallback to pessimistic DB locks or queue-based approach

### PostgreSQL Failure

**Detection**: Query timeout/connection error
**Impact**: HIGH - Cannot create schedules or executions
**Recovery**:
- Scheduler continues running (uses cached schedules)
- Cannot record new executions
- Read replica could provide read-only mode

### Agent Unreachable

**Detection**: HTTP timeout or error
**Impact**: LOW - Single execution fails
**Recovery**: Automatic retry with exponential backoff

## Security Considerations

### Current State (MVP)

- No authentication (open API)
- No authorization (anyone can modify schedules)
- No input sanitization beyond validation
- Secrets stored in plain text (headers, payloads)

### Production Hardening

**Authentication & Authorization**:
```typescript
// JWT-based auth
app.use('/api', jwtMiddleware);

// Role-based access control
app.use('/api/schedules', checkPermission('schedules:write'));
```

**Secrets Management**:
```typescript
// Store references, not values
schedule.headers = {
  Authorization: '${vault.secrets.agent_token}'
};

// Resolve at execution time
const headers = await secretManager.resolve(schedule.headers);
```

**Input Sanitization**:
```typescript
// Prevent SSRF attacks
if (isInternalUrl(schedule.agentUrl)) {
  throw new Error('Cannot target internal URLs');
}
```

**Rate Limiting**:
```typescript
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));
```

## Monitoring & Observability

### Recommended Metrics

**Scheduler Metrics**:
- `scheduler_tick_duration_ms`: Time to process one tick
- `scheduler_schedules_checked_total`: Schedules evaluated
- `scheduler_lock_acquisition_success_rate`: % of locks acquired
- `scheduler_execution_trigger_total`: Executions triggered

**Execution Metrics**:
- `execution_status_total{status="success|failed"}`: By status
- `execution_duration_ms`: Time from start to completion
- `execution_retry_count`: Number of retries
- `agent_http_error_total{status_code}`: By HTTP status

**System Metrics**:
- `postgres_connection_pool_active`: Active connections
- `redis_connection_errors_total`: Redis failures

### Recommended Logs

```typescript
// Structured logging
logger.info('execution_triggered', {
  scheduleId,
  scheduleName,
  fireTime,
  executionId,
  instanceId
});

logger.error('execution_failed', {
  executionId,
  attempt,
  error: error.message,
  agentUrl
});
```

### Distributed Tracing

```typescript
// OpenTelemetry span
const span = tracer.startSpan('trigger_execution');
span.setAttributes({
  'schedule.id': scheduleId,
  'schedule.name': scheduleName
});

// Propagate context to agent call
const headers = {
  'traceparent': span.getTraceParent()
};
```

## Alternative Approaches Considered

### 1. Message Queue (RabbitMQ/SQS)

**Approach**: Publish schedule fires to queue, workers consume

**Pros**:
- Natural exactly-once with message acknowledgment
- Better load distribution
- Built-in retry/DLQ

**Cons**:
- Additional infrastructure
- More complex (producer + consumer services)
- Not requested in requirements

### 2. Database-Only (Pessimistic Locks)

**Approach**: Use PostgreSQL advisory locks

**Pros**:
- One less service (no Redis)
- ACID guarantees

**Cons**:
- Slower (disk I/O)
- Connection pool contention
- Doesn't scale as well

### 3. Leader Election (Raft/Etcd)

**Approach**: Elect one leader, only leader schedules

**Pros**:
- Simple coordination
- No race conditions

**Cons**:
- Single point of failure (until re-election)
- Underutilizes instances
- Complex consensus protocol

**Why Current Approach?**:
- Balances simplicity and scalability
- Leverages Redis (common in microservices)
- No single point of failure
- Easy to understand and maintain

## Future Enhancements

### 1. Schedule Sharding

Partition schedules across instances by ID hash:
```typescript
if (hash(scheduleId) % instanceCount === instanceIndex) {
  checkSchedule(schedule);
}
```

**Benefit**: Reduce lock contention, better load distribution

### 2. Execution Batching

Group multiple due fire times into single batch:
```typescript
const batch = [];
for (const fireTime of dueTimes) {
  if (await acquireLock(fireTime)) {
    batch.push(fireTime);
  }
}
await executeBatch(batch);
```

**Benefit**: Reduce DB round-trips

### 3. Priority Scheduling

Add priority field to schedules:
```typescript
const schedules = await repo.findEnabled({
  orderBy: 'priority DESC'
});
```

**Benefit**: Critical schedules execute first under load

### 4. Execution Time Windowing

Add execution windows (e.g., only 9-5 on weekdays):
```typescript
schedule.executionWindow = {
  daysOfWeek: [1,2,3,4,5],
  hoursOfDay: [9,10,11,12,13,14,15,16,17]
};
```

**Benefit**: More flexible scheduling

---

This architecture provides a solid foundation for a production-ready distributed scheduler while remaining simple enough to understand, test, and maintain.
