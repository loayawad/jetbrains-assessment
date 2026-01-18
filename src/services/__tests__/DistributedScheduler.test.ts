import { DistributedScheduler } from '../DistributedScheduler';
import { ScheduleRepository } from '../../repositories/ScheduleRepository';
import { ExecutionRepository } from '../../repositories/ExecutionRepository';
import { AgentExecutor } from '../AgentExecutor';
import { redisClient } from '../RedisClient';
import { Schedule, Execution, ExecutionStatus } from '../../types';

// Mock dependencies
jest.mock('../../repositories/ScheduleRepository');
jest.mock('../../repositories/ExecutionRepository');
jest.mock('../AgentExecutor');
jest.mock('../RedisClient');

describe('DistributedScheduler', () => {
  let scheduler: DistributedScheduler;
  let mockScheduleRepo: jest.Mocked<ScheduleRepository>;
  let mockExecutionRepo: jest.Mocked<ExecutionRepository>;
  let mockExecutor: jest.Mocked<AgentExecutor>;
  let mockSchedule: Schedule;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockScheduleRepo = new ScheduleRepository() as jest.Mocked<ScheduleRepository>;
    mockExecutionRepo = new ExecutionRepository() as jest.Mocked<ExecutionRepository>;
    mockExecutor = new AgentExecutor() as jest.Mocked<AgentExecutor>;

    scheduler = new DistributedScheduler();
    (scheduler as any).scheduleRepo = mockScheduleRepo;
    (scheduler as any).executionRepo = mockExecutionRepo;
    (scheduler as any).executor = mockExecutor;

    mockSchedule = {
      id: 'schedule-1',
      name: 'Test Schedule',
      cronExpression: '* * * * *',
      agentId: 'agent-1',
      agentUrl: 'https://example.com/webhook',
      httpMethod: 'POST',
      headers: {},
      payload: {},
      retryPolicy: {
        maxAttempts: 3,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
      },
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start and stop', () => {
    it('should start the scheduler and load schedules', async () => {
      mockScheduleRepo.findEnabled.mockResolvedValue([mockSchedule]);

      await scheduler.start();

      expect(mockScheduleRepo.findEnabled).toHaveBeenCalled();
      expect((scheduler as any).running).toBe(true);
      expect((scheduler as any).tickInterval).not.toBeNull();
    });

    it('should not start if already running', async () => {
      mockScheduleRepo.findEnabled.mockResolvedValue([]);

      await scheduler.start();
      await scheduler.start(); // Second call

      // Should only load schedules once
      expect(mockScheduleRepo.findEnabled).toHaveBeenCalledTimes(1);
    });

    it('should stop the scheduler cleanly', async () => {
      mockScheduleRepo.findEnabled.mockResolvedValue([]);

      await scheduler.start();
      await scheduler.stop();

      expect((scheduler as any).running).toBe(false);
      expect((scheduler as any).tickInterval).toBeNull();
    });
  });

  describe('distributed locking', () => {
    it('should acquire lock and trigger execution', async () => {
      const mockExecution: Execution = {
        id: 'execution-1',
        scheduleId: 'schedule-1',
        fireTime: new Date(),
        status: ExecutionStatus.PENDING,
        attempts: 0,
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
        response: undefined,
      };

      (redisClient.acquireLock as jest.Mock).mockResolvedValue(true);
      mockExecutionRepo.create.mockResolvedValue(mockExecution);
      mockExecutor.execute.mockResolvedValue(undefined);

      const triggerExecution = (scheduler as any).triggerExecution.bind(scheduler);
      await triggerExecution(mockSchedule, new Date());

      expect(redisClient.acquireLock).toHaveBeenCalled();
      expect(mockExecutionRepo.create).toHaveBeenCalledWith(
        'schedule-1',
        expect.any(Date)
      );
      expect(mockExecutor.execute).toHaveBeenCalledWith(mockSchedule, mockExecution);
    });

    it('should skip execution if lock cannot be acquired', async () => {
      (redisClient.acquireLock as jest.Mock).mockResolvedValue(false);

      const triggerExecution = (scheduler as any).triggerExecution.bind(scheduler);
      await triggerExecution(mockSchedule, new Date());

      expect(redisClient.acquireLock).toHaveBeenCalled();
      expect(mockExecutionRepo.create).not.toHaveBeenCalled();
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('should release lock on execution creation failure', async () => {
      (redisClient.acquireLock as jest.Mock).mockResolvedValue(true);
      mockExecutionRepo.create.mockRejectedValue(new Error('Database error'));

      const triggerExecution = (scheduler as any).triggerExecution.bind(scheduler);
      await triggerExecution(mockSchedule, new Date());

      expect(redisClient.releaseLock).toHaveBeenCalled();
    });
  });

  describe('schedule checking', () => {
    it('should detect when schedule is due to fire', async () => {
      mockScheduleRepo.findEnabled.mockResolvedValue([
        {
          ...mockSchedule,
          cronExpression: '*/5 * * * *', // Every 5 minutes
        },
      ]);
      (redisClient.acquireLock as jest.Mock).mockResolvedValue(true);
      mockExecutionRepo.create.mockResolvedValue({} as Execution);

      await scheduler.start();

      // Set time to a moment when schedule should fire
      const now = new Date('2024-01-01T10:05:00Z');
      jest.setSystemTime(now);

      // Manually trigger check
      const checkSchedule = (scheduler as any).checkSchedule.bind(scheduler);
      await checkSchedule(mockSchedule, now);

      // Should attempt to trigger execution
      expect(mockExecutionRepo.create).toHaveBeenCalled();
    });

    it('should skip disabled schedules', async () => {
      const disabledSchedule = { ...mockSchedule, enabled: false };
      mockScheduleRepo.findEnabled.mockResolvedValue([disabledSchedule]);

      await scheduler.start();

      // Trigger a tick
      (scheduler as any).scheduleCache.set(disabledSchedule.id, disabledSchedule);
      await (scheduler as any).tick();

      // Should not attempt execution for disabled schedule
      expect(mockExecutionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('schedule refresh', () => {
    it('should refresh schedules from database', async () => {
      const newSchedule = { ...mockSchedule, id: 'schedule-2' };
      mockScheduleRepo.findEnabled.mockResolvedValue([mockSchedule, newSchedule]);

      const refreshSchedules = (scheduler as any).refreshSchedules.bind(scheduler);
      await refreshSchedules();

      const cache = (scheduler as any).scheduleCache;
      expect(cache.size).toBe(2);
      expect(cache.has('schedule-1')).toBe(true);
      expect(cache.has('schedule-2')).toBe(true);
    });

    it('should handle refresh errors gracefully', async () => {
      mockScheduleRepo.findEnabled.mockRejectedValue(new Error('Database error'));

      const refreshSchedules = (scheduler as any).refreshSchedules.bind(scheduler);
      await expect(refreshSchedules()).resolves.not.toThrow();
    });
  });

  describe('tick mechanism', () => {
    it('should not tick when stopped', async () => {
      mockScheduleRepo.findEnabled.mockResolvedValue([mockSchedule]);

      await scheduler.start();
      await scheduler.stop();

      // Clear previous calls
      mockScheduleRepo.findEnabled.mockClear();

      // Try to tick
      await (scheduler as any).tick();

      // Should return early without checking schedules
      expect(mockScheduleRepo.findEnabled).not.toHaveBeenCalled();
    });

    it('should handle tick errors without crashing', async () => {
      mockScheduleRepo.findEnabled.mockResolvedValue([mockSchedule]);

      await scheduler.start();

      // Set up cache with schedule
      (scheduler as any).scheduleCache.set(mockSchedule.id, mockSchedule);

      // Make checkSchedule throw an error
      const originalCheck = (scheduler as any).checkSchedule;
      (scheduler as any).checkSchedule = jest.fn().mockRejectedValue(new Error('Check failed'));

      // Tick should not throw
      await expect((scheduler as any).tick()).resolves.not.toThrow();

      // Restore
      (scheduler as any).checkSchedule = originalCheck;
    });
  });
});
