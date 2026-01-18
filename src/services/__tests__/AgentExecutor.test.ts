import { AgentExecutor } from '../AgentExecutor';
import { ExecutionRepository } from '../../repositories/ExecutionRepository';
import { Schedule, Execution, ExecutionStatus } from '../../types';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../../repositories/ExecutionRepository');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AgentExecutor', () => {
  let executor: AgentExecutor;
  let mockExecutionRepo: jest.Mocked<ExecutionRepository>;
  let mockSchedule: Schedule;
  let mockExecution: Execution;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockExecutionRepo = new ExecutionRepository() as jest.Mocked<ExecutionRepository>;
    executor = new AgentExecutor();
    (executor as any).executionRepo = mockExecutionRepo;

    mockSchedule = {
      id: 'schedule-1',
      name: 'Test Schedule',
      cronExpression: '* * * * *',
      agentId: 'agent-1',
      agentUrl: 'https://example.com/webhook',
      httpMethod: 'POST',
      headers: { 'X-Custom': 'test' },
      payload: { data: 'test' },
      retryPolicy: {
        maxAttempts: 3,
        backoffMultiplier: 2,
        initialDelayMs: 100,
        maxDelayMs: 1000,
      },
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockExecution = {
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
  });

  describe('execute - success scenarios', () => {
    it('should successfully execute agent call on first attempt', async () => {
      const mockResponse = { data: { success: true } };
      (mockedAxios as any).mockResolvedValueOnce(mockResponse);

      await executor.execute(mockSchedule, mockExecution);

      // Should update to RUNNING first
      expect(mockExecutionRepo.updateStatus).toHaveBeenNthCalledWith(
        1,
        'execution-1',
        ExecutionStatus.RUNNING,
        expect.objectContaining({ attempts: 1 })
      );

      // Should update to SUCCESS after successful call
      expect(mockExecutionRepo.updateStatus).toHaveBeenNthCalledWith(
        2,
        'execution-1',
        ExecutionStatus.SUCCESS,
        expect.objectContaining({
          attempts: 1,
          response: mockResponse.data,
        })
      );

      // Should make HTTP call with correct config
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://example.com/webhook',
          headers: expect.objectContaining({
            'X-Custom': 'test',
            'X-Agent-Id': 'agent-1',
          }),
          data: { data: 'test' },
        })
      );
    });
  });

  describe('execute - retry scenarios', () => {
    it('should retry on failure and succeed on second attempt', async () => {
      (mockedAxios as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { success: true } });

      await executor.execute(mockSchedule, mockExecution);

      // First attempt: RUNNING
      expect(mockExecutionRepo.updateStatus).toHaveBeenNthCalledWith(
        1,
        'execution-1',
        ExecutionStatus.RUNNING,
        expect.objectContaining({ attempts: 1 })
      );

      // Second attempt: RETRYING
      expect(mockExecutionRepo.updateStatus).toHaveBeenNthCalledWith(
        2,
        'execution-1',
        ExecutionStatus.RETRYING,
        expect.objectContaining({ attempts: 2 })
      );

      // Final: SUCCESS
      expect(mockExecutionRepo.updateStatus).toHaveBeenNthCalledWith(
        3,
        'execution-1',
        ExecutionStatus.SUCCESS,
        expect.objectContaining({ attempts: 2 })
      );
    });

    it('should fail after exhausting all retry attempts', async () => {
      (mockedAxios as any).mockRejectedValue(new Error('Service unavailable'));

      await executor.execute(mockSchedule, mockExecution);

      // Should attempt 3 times
      expect(mockedAxios).toHaveBeenCalledTimes(3);

      // Final status should be FAILED
      expect(mockExecutionRepo.updateStatus).toHaveBeenLastCalledWith(
        'execution-1',
        ExecutionStatus.FAILED,
        expect.objectContaining({
          attempts: 3,
          error: expect.stringContaining('Service unavailable'),
        })
      );
    });

    it('should use exponential backoff between retries', async () => {
      jest.useFakeTimers();
      (mockedAxios as any).mockRejectedValue(new Error('Temporary failure'));

      const executePromise = executor.execute(mockSchedule, mockExecution);

      // Fast-forward through delays
      await jest.runAllTimersAsync();
      await executePromise;

      jest.useRealTimers();

      // Verify backoff calculations:
      // Attempt 1 -> 2: 100ms * 2^0 = 100ms
      // Attempt 2 -> 3: 100ms * 2^1 = 200ms
      expect(mockExecutionRepo.updateStatus).toHaveBeenCalledTimes(4); // RUNNING, RETRYING, RETRYING, FAILED
    });
  });

  describe('execute - error handling', () => {
    it('should handle HTTP error responses', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
        message: 'Request failed',
      };
      (mockedAxios as any).mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await executor.execute(mockSchedule, mockExecution);

      expect(mockExecutionRepo.updateStatus).toHaveBeenLastCalledWith(
        'execution-1',
        ExecutionStatus.FAILED,
        expect.objectContaining({
          error: expect.stringContaining('HTTP 500'),
        })
      );
    });

    it('should handle network timeout errors', async () => {
      const axiosError = {
        isAxiosError: true,
        request: {},
        message: 'timeout of 30000ms exceeded',
      };
      (mockedAxios as any).mockRejectedValue(axiosError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await executor.execute(mockSchedule, mockExecution);

      expect(mockExecutionRepo.updateStatus).toHaveBeenLastCalledWith(
        'execution-1',
        ExecutionStatus.FAILED,
        expect.objectContaining({
          error: expect.stringContaining('No response received'),
        })
      );
    });
  });

  describe('backoff calculation', () => {
    it('should calculate exponential backoff correctly', () => {
      const calculateBackoff = (executor as any).calculateBackoff.bind(executor);
      const policy = mockSchedule.retryPolicy;

      expect(calculateBackoff(1, policy)).toBe(100); // 100 * 2^0
      expect(calculateBackoff(2, policy)).toBe(200); // 100 * 2^1
      expect(calculateBackoff(3, policy)).toBe(400); // 100 * 2^2
    });

    it('should cap backoff at maxDelayMs', () => {
      const calculateBackoff = (executor as any).calculateBackoff.bind(executor);
      const policy = {
        ...mockSchedule.retryPolicy,
        maxDelayMs: 300,
      };

      expect(calculateBackoff(3, policy)).toBe(300); // capped from 400 to 300
      expect(calculateBackoff(10, policy)).toBe(300); // way over, capped
    });
  });
});
