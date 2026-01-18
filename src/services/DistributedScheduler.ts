import parser from 'cron-parser';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { ExecutionRepository } from '../repositories/ExecutionRepository';
import { AgentExecutor } from './AgentExecutor';
import { redisClient } from './RedisClient';
import { config } from '../config';
import { Schedule } from '../types';

export class DistributedScheduler {
  private scheduleRepo: ScheduleRepository;
  private executionRepo: ExecutionRepository;
  private executor: AgentExecutor;
  private running = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private scheduleCache = new Map<string, Schedule>();
  private lastCheckTime = new Map<string, Date>();

  constructor() {
    this.scheduleRepo = new ScheduleRepository();
    this.executionRepo = new ExecutionRepository();
    this.executor = new AgentExecutor();
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting distributed scheduler...');
    this.running = true;

    // Initial load of schedules
    await this.refreshSchedules();

    // Start the tick loop
    this.tickInterval = setInterval(async () => {
      await this.tick();
    }, config.scheduler.tickInterval);

    console.log(
      `✅ [Scheduler] Started with tick interval: ${config.scheduler.tickInterval}ms`
    );
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    console.log('[Scheduler] Stopping...');
    this.running = false;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    console.log('✅ [Scheduler] Stopped');
  }

  /**
   * Main scheduler tick - checks all schedules and fires due ones
   */
  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      // Refresh schedules periodically (every 10 ticks)
      if (Math.random() < 0.1) {
        await this.refreshSchedules();
      }

      const now = new Date();

      // Check each enabled schedule
      for (const schedule of this.scheduleCache.values()) {
        if (!schedule.enabled) continue;

        try {
          await this.checkSchedule(schedule, now);
        } catch (error) {
          console.error(`[Scheduler] Error checking schedule ${schedule.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error in tick:', error);
    }
  }

  /**
   * Check if a schedule should fire
   */
  private async checkSchedule(schedule: Schedule, now: Date): Promise<void> {
    const lastCheck = this.lastCheckTime.get(schedule.id) || new Date(now.getTime() - 60000);

    try {
      // Parse cron expression starting from last check
      const cronExpr = parser.parseExpression(schedule.cronExpression, {
        currentDate: new Date(lastCheck.getTime() - 1000), // Start 1 second before
      });

      // Check all fire times between last check and now
      while (true) {
        try {
          const nextFireTime = cronExpr.next();
          const fireTime = nextFireTime.toDate();

          // If fire time is beyond now, we're done
          if (fireTime > now) {
            break;
          }

          // If fire time is after last check and before/at now, trigger execution
          if (fireTime > lastCheck && fireTime <= now) {
            await this.triggerExecution(schedule, fireTime);
          }
        } catch (error) {
          // No more fire times available
          break;
        }
      }
    } catch (error) {
      // Silently ignore cron parsing errors (might be invalid cron or other issues)
      // This prevents spam in logs for schedules that can't be parsed
    }

    // Update last check time
    this.lastCheckTime.set(schedule.id, now);
  }

  /**
   * Trigger an execution with distributed locking to ensure exactly-once
   */
  private async triggerExecution(schedule: Schedule, fireTime: Date): Promise<void> {
    // Create unique execution key: schedule_id + fire_time
    const executionKey = `execution:${schedule.id}:${fireTime.getTime()}`;

    // Try to acquire distributed lock
    const lockAcquired = await redisClient.acquireLock(executionKey, config.scheduler.lockTTL);

    if (!lockAcquired) {
      // Another instance is handling this execution
      return;
    }

    console.log(
      `[Scheduler] 🔥 Triggering execution for schedule ${schedule.name} (${schedule.id}) at ${fireTime.toISOString()}`
    );

    try {
      // Create execution record
      const execution = await this.executionRepo.create(schedule.id, fireTime);

      // Execute asynchronously (don't await - fire and forget)
      this.executor.execute(schedule, execution).catch((error) => {
        console.error(`[Scheduler] Execution ${execution.id} threw error:`, error);
      });
    } catch (error) {
      console.error(`[Scheduler] Failed to create execution for schedule ${schedule.id}:`, error);
      // Release lock on error
      await redisClient.releaseLock(executionKey);
    }
  }

  /**
   * Refresh the schedule cache from database
   */
  private async refreshSchedules(): Promise<void> {
    try {
      const schedules = await this.scheduleRepo.findEnabled();
      this.scheduleCache.clear();
      schedules.forEach((schedule) => {
        this.scheduleCache.set(schedule.id, schedule);
      });
      console.log(`[Scheduler] Loaded ${schedules.length} enabled schedules`);
    } catch (error) {
      console.error('[Scheduler] Failed to refresh schedules:', error);
    }
  }
}
