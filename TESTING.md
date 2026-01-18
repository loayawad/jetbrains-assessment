# Testing Guide

## Manual Testing

### 1. Basic CRUD Operations

#### Create a Schedule

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning Report",
    "cronExpression": "0 9 * * *",
    "agentId": "report-001",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "headers": {
      "Authorization": "Bearer test-token"
    },
    "payload": {
      "reportType": "daily",
      "recipients": ["admin@example.com"]
    },
    "retryPolicy": {
      "maxAttempts": 3,
      "backoffMultiplier": 2,
      "initialDelayMs": 1000,
      "maxDelayMs": 30000
    },
    "enabled": true
  }'
```

#### List All Schedules

```bash
curl http://localhost:3000/api/schedules | jq
```

#### Get Specific Schedule

```bash
SCHEDULE_ID="<id-from-create>"
curl http://localhost:3000/api/schedules/$SCHEDULE_ID | jq
```

#### Update Schedule

```bash
curl -X PUT http://localhost:3000/api/schedules/$SCHEDULE_ID \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

#### Delete Schedule

```bash
curl -X DELETE http://localhost:3000/api/schedules/$SCHEDULE_ID
```

### 2. Test Cron Scheduling

#### Every Minute

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Every Minute Test",
    "cronExpression": "* * * * *",
    "agentId": "test-001",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "enabled": true
  }'
```

Wait 1-2 minutes, then check executions:

```bash
curl http://localhost:3000/api/schedules/$SCHEDULE_ID/executions | jq
```

You should see multiple execution records.

#### Every 5 Minutes

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Every 5 Minutes",
    "cronExpression": "*/5 * * * *",
    "agentId": "test-002",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "enabled": true
  }'
```

### 3. Test Retry Logic

#### Create Schedule with Failing URL

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Failing Agent",
    "cronExpression": "* * * * *",
    "agentId": "fail-001",
    "agentUrl": "https://httpstat.us/500",
    "httpMethod": "GET",
    "retryPolicy": {
      "maxAttempts": 3,
      "backoffMultiplier": 2,
      "initialDelayMs": 1000
    },
    "enabled": true
  }'
```

Check logs to see retry attempts:

```bash
docker-compose logs -f scheduler | grep "Retrying"
```

Check execution status:

```bash
curl http://localhost:3000/api/schedules/$SCHEDULE_ID/executions | jq
```

You should see:
- `attempts: 3`
- `status: "FAILED"`
- `error: "HTTP 500: ..."`

### 4. Test Distributed Locking

#### Start Multiple Instances

```bash
docker-compose --profile scale up -d
```

#### Create High-Frequency Schedule

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lock Test",
    "cronExpression": "* * * * *",
    "agentId": "lock-001",
    "agentUrl": "https://httpbin.org/delay/2",
    "httpMethod": "GET",
    "enabled": true
  }'
```

#### Watch Both Instances

Terminal 1:
```bash
docker-compose logs -f scheduler | grep "Triggering execution"
```

Terminal 2:
```bash
docker-compose logs -f scheduler-2 | grep "Triggering execution"
```

**Expected**: Only one instance logs "Triggering execution" per minute.

#### Verify Exactly-Once

```bash
# Wait 5 minutes, then check
curl http://localhost:3000/api/schedules/$SCHEDULE_ID/executions | jq 'length'
```

Should return `5` (one per minute), not `10` (which would indicate duplicates).

### 5. Test Different HTTP Methods

#### GET Request

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GET Test",
    "cronExpression": "*/2 * * * *",
    "agentId": "get-001",
    "agentUrl": "https://httpbin.org/get",
    "httpMethod": "GET",
    "enabled": true
  }'
```

#### PUT Request

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PUT Test",
    "cronExpression": "*/2 * * * *",
    "agentId": "put-001",
    "agentUrl": "https://httpbin.org/put",
    "httpMethod": "PUT",
    "payload": {"update": "data"},
    "enabled": true
  }'
```

#### DELETE Request

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DELETE Test",
    "cronExpression": "*/2 * * * *",
    "agentId": "delete-001",
    "agentUrl": "https://httpbin.org/delete",
    "httpMethod": "DELETE",
    "enabled": true
  }'
```

### 6. Test Custom Headers

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Headers Test",
    "cronExpression": "*/2 * * * *",
    "agentId": "header-001",
    "agentUrl": "https://httpbin.org/headers",
    "httpMethod": "GET",
    "headers": {
      "X-Custom-Header": "test-value",
      "X-Request-ID": "12345"
    },
    "enabled": true
  }'
```

Check execution response to verify headers were sent:

```bash
curl http://localhost:3000/api/schedules/$SCHEDULE_ID/executions | jq '.[0].response'
```

### 7. Test Validation

#### Invalid Cron Expression

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invalid Cron",
    "cronExpression": "invalid cron",
    "agentId": "test",
    "agentUrl": "https://httpbin.org/post",
    "enabled": true
  }'
```

**Expected**: 400 error with validation message.

#### Invalid URL

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invalid URL",
    "cronExpression": "* * * * *",
    "agentId": "test",
    "agentUrl": "not-a-url",
    "enabled": true
  }'
```

**Expected**: 400 error with validation message.

#### Missing Required Fields

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Missing Fields"
  }'
```

**Expected**: 400 error listing missing fields.

## Integration Testing Scenarios

### Scenario 1: Schedule Lifecycle

1. Create schedule (disabled)
2. Verify it doesn't execute
3. Enable schedule
4. Wait for execution
5. Verify execution succeeded
6. Disable schedule
7. Verify no more executions
8. Delete schedule
9. Verify executions are deleted (CASCADE)

### Scenario 2: Concurrent Executions

1. Create schedule with 1-minute interval
2. Set agent URL to slow endpoint (httpbin.org/delay/90)
3. Wait 2 minutes
4. Check executions - should see 2 running concurrently

### Scenario 3: Retry Exhaustion

1. Create schedule with max 2 retries
2. Point to always-failing endpoint
3. Wait for execution
4. Verify exactly 2 retry attempts
5. Verify final status is FAILED

### Scenario 4: Schedule Update During Execution

1. Create schedule
2. Wait for execution to start
3. Update schedule (change URL)
4. Verify in-progress execution completes with old URL
5. Verify next execution uses new URL

## Performance Testing

### Load Test: Many Schedules

```bash
# Create 100 schedules
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/schedules \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"Load Test $i\",
      \"cronExpression\": \"*/5 * * * *\",
      \"agentId\": \"load-$i\",
      \"agentUrl\": \"https://httpbin.org/post\",
      \"httpMethod\": \"POST\",
      \"enabled\": true
    }" &
done
wait
```

Monitor scheduler performance:

```bash
docker stats scheduler-service
```

### Load Test: High Frequency

```bash
# Create schedule that fires every second (not recommended for production!)
# Note: Standard cron only supports minute-level granularity
# This is for testing scheduler overhead

curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Frequency",
    "cronExpression": "* * * * *",
    "agentId": "hf-001",
    "agentUrl": "https://httpbin.org/post",
    "httpMethod": "POST",
    "enabled": true
  }'
```

## Chaos Testing

### Kill Scheduler Mid-Execution

```bash
# Start execution
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Chaos Test",
    "cronExpression": "* * * * *",
    "agentId": "chaos-001",
    "agentUrl": "https://httpbin.org/delay/30",
    "httpMethod": "GET",
    "enabled": true
  }'

# Wait 10 seconds, then kill
sleep 10
docker-compose kill scheduler

# Restart
docker-compose up -d scheduler

# Check execution status
curl http://localhost:3000/api/schedules/$SCHEDULE_ID/executions | jq
```

**Expected**: Execution stuck in RUNNING state (observable failure).

### Redis Failure

```bash
# Stop Redis
docker-compose stop redis

# Try to trigger execution (should fail gracefully)
# Check logs
docker-compose logs scheduler

# Restart Redis
docker-compose start redis
```

### Database Failure

```bash
# Stop PostgreSQL
docker-compose stop postgres

# Scheduler should continue with cached schedules
# But cannot create new executions

# Restart PostgreSQL
docker-compose start postgres
```

## Test Checklist

- [ ] Create schedule via API
- [ ] Create schedule via UI
- [ ] Update schedule
- [ ] Delete schedule
- [ ] Schedule executes at correct time
- [ ] Execution retries on failure
- [ ] Execution succeeds after retry
- [ ] Multiple instances don't duplicate executions
- [ ] Lock expires after TTL
- [ ] Invalid cron expression rejected
- [ ] Invalid URL rejected
- [ ] Custom headers sent to agent
- [ ] Custom payload sent to agent
- [ ] Execution history viewable
- [ ] Disabled schedule doesn't execute
- [ ] Schedule update doesn't affect in-progress execution
- [ ] Health check returns correct status
- [ ] Graceful shutdown

## Automated Testing

### Unit Tests (Jest)

The project includes comprehensive unit tests for all core components. Run them with:

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage report
yarn test:coverage
```

### Test Coverage

#### AgentExecutor Tests (8 tests)
- ✅ Successful execution on first attempt
- ✅ Retry logic with exponential backoff
- ✅ Failure after exhausting retry attempts
- ✅ HTTP error response handling (5xx)
- ✅ Network timeout handling
- ✅ Exponential backoff calculation
- ✅ Backoff delay capping at maxDelayMs

**Location**: `src/services/__tests__/AgentExecutor.test.ts`

#### DistributedScheduler Tests (12 tests)
- ✅ Scheduler start/stop lifecycle
- ✅ Distributed lock acquisition and execution triggering
- ✅ Lock contention handling (skip if already held)
- ✅ Lock release on execution creation failure
- ✅ Schedule fire time detection
- ✅ Disabled schedule skipping
- ✅ Schedule cache refresh from database
- ✅ Error handling in refresh and tick mechanisms

**Location**: `src/services/__tests__/DistributedScheduler.test.ts`

#### ScheduleRepository Tests (14 tests)
- ✅ Find all schedules
- ✅ Find schedule by ID
- ✅ Find enabled schedules only
- ✅ Create schedule with defaults and custom configurations
- ✅ Update schedule fields (single and multiple)
- ✅ Delete schedule
- ✅ Handle non-existent schedules

**Location**: `src/repositories/__tests__/ScheduleRepository.test.ts`

#### ExecutionRepository Tests (13 tests)
- ✅ Find executions by schedule ID with limit
- ✅ Find execution by ID
- ✅ Create execution with PENDING status
- ✅ Update execution status with metadata
- ✅ Status transitions (PENDING → RUNNING → SUCCESS/FAILED)
- ✅ Handle retry attempts and completion data

**Location**: `src/repositories/__tests__/ExecutionRepository.test.ts`

#### Validation Tests (27 tests)
- ✅ Schedule creation validation
- ✅ Schedule update validation
- ✅ Name, cron expression, URL, HTTP method validation
- ✅ Retry policy constraint validation
- ✅ Edge case handling (null, undefined, invalid types)

**Location**: `src/utils/__tests__/validation.test.ts`

### Test Configuration

Tests are configured using Jest with TypeScript support (`ts-jest`). Configuration can be found in `jest.config.js`.

### Integration Tests (Future)

Integration tests for end-to-end API testing are planned for future implementation:

```typescript
describe('Schedule API', () => {
  it('should create and execute schedule', async () => {
    // End-to-end test
  });
});
```

---

**Testing Time**: ~30 minutes for full manual test suite  
**Recommended**: Run before submitting, after any major changes
