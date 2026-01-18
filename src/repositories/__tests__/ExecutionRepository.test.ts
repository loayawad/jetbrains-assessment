import { ExecutionRepository } from '../ExecutionRepository';
import { query } from '../../db/client';
import { ExecutionStatus } from '../../types';

// Mock database client
jest.mock('../../db/client');
const mockedQuery = query as jest.MockedFunction<typeof query>;

describe('ExecutionRepository', () => {
  let repository: ExecutionRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ExecutionRepository();
  });

  const mockExecutionRow = {
    id: 'execution-1',
    scheduleId: 'schedule-1',
    fireTime: new Date('2024-01-01T10:00:00Z'),
    status: ExecutionStatus.PENDING,
    attempts: 0,
    startedAt: null,
    completedAt: null,
    error: null,
    response: null,
  };

  describe('findByScheduleId', () => {
    it('should return executions for a schedule', async () => {
      mockedQuery.mockResolvedValue([mockExecutionRow]);

      const executions = await repository.findByScheduleId('schedule-1');

      expect(executions).toHaveLength(1);
      expect(executions[0].scheduleId).toBe('schedule-1');
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE schedule_id = $1'),
        ['schedule-1', 50]
      );
    });

    it('should respect limit parameter', async () => {
      mockedQuery.mockResolvedValue([]);

      await repository.findByScheduleId('schedule-1', 10);

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['schedule-1', 10]
      );
    });

    it('should return empty array when no executions exist', async () => {
      mockedQuery.mockResolvedValue([]);

      const executions = await repository.findByScheduleId('schedule-1');

      expect(executions).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('should return execution by id', async () => {
      mockedQuery.mockResolvedValue([mockExecutionRow]);

      const execution = await repository.findById('execution-1');

      expect(execution).not.toBeNull();
      expect(execution?.id).toBe('execution-1');
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['execution-1']
      );
    });

    it('should return null when execution not found', async () => {
      mockedQuery.mockResolvedValue([]);

      const execution = await repository.findById('non-existent');

      expect(execution).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new execution', async () => {
      const fireTime = new Date('2024-01-01T10:00:00Z');
      mockedQuery.mockResolvedValue([mockExecutionRow]);

      const execution = await repository.create('schedule-1', fireTime);

      expect(execution).toBeDefined();
      expect(execution.scheduleId).toBe('schedule-1');
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO executions'),
        expect.arrayContaining([
          expect.any(String), // id (uuid)
          'schedule-1',
          fireTime,
          ExecutionStatus.PENDING,
          0,
        ])
      );
    });

    it('should create execution with PENDING status and 0 attempts', async () => {
      const fireTime = new Date();
      mockedQuery.mockResolvedValue([mockExecutionRow]);

      await repository.create('schedule-1', fireTime);

      const callArgs = mockedQuery.mock.calls[0][1];
      expect(callArgs?.[3]).toBe(ExecutionStatus.PENDING);
      expect(callArgs?.[4]).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('should update execution status', async () => {
      const updatedRow = { ...mockExecutionRow, status: ExecutionStatus.RUNNING };
      mockedQuery.mockResolvedValue([updatedRow]);

      const execution = await repository.updateStatus(
        'execution-1',
        ExecutionStatus.RUNNING
      );

      expect(execution).not.toBeNull();
      expect(execution?.status).toBe(ExecutionStatus.RUNNING);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE executions'),
        expect.arrayContaining(['execution-1', ExecutionStatus.RUNNING])
      );
    });

    it('should update status with additional data', async () => {
      const startedAt = new Date('2024-01-01T10:00:00Z');
      const updatedRow = {
        ...mockExecutionRow,
        status: ExecutionStatus.RUNNING,
        attempts: 1,
        startedAt,
      };
      mockedQuery.mockResolvedValue([updatedRow]);

      await repository.updateStatus('execution-1', ExecutionStatus.RUNNING, {
        attempts: 1,
        startedAt,
      });

      const sql = mockedQuery.mock.calls[0][0];
      const values = mockedQuery.mock.calls[0][1];

      expect(sql).toContain('attempts =');
      expect(sql).toContain('started_at =');
      expect(values).toContain(1);
      expect(values).toContain(startedAt);
    });

    it('should update to SUCCESS with response', async () => {
      const completedAt = new Date('2024-01-01T10:01:00Z');
      const response = { data: 'success' };
      const updatedRow = {
        ...mockExecutionRow,
        status: ExecutionStatus.SUCCESS,
        completedAt,
        response,
      };
      mockedQuery.mockResolvedValue([updatedRow]);

      await repository.updateStatus('execution-1', ExecutionStatus.SUCCESS, {
        completedAt,
        response,
        attempts: 1,
      });

      const sql = mockedQuery.mock.calls[0][0];
      const values = mockedQuery.mock.calls[0][1];

      expect(sql).toContain('completed_at =');
      expect(sql).toContain('response =');
      expect(values).toContain(completedAt);
      expect(values).toContain(JSON.stringify(response));
    });

    it('should update to FAILED with error', async () => {
      const completedAt = new Date('2024-01-01T10:01:00Z');
      const error = 'HTTP 500: Internal Server Error';
      const updatedRow = {
        ...mockExecutionRow,
        status: ExecutionStatus.FAILED,
        completedAt,
        error,
      };
      mockedQuery.mockResolvedValue([updatedRow]);

      await repository.updateStatus('execution-1', ExecutionStatus.FAILED, {
        completedAt,
        error,
        attempts: 3,
      });

      const sql = mockedQuery.mock.calls[0][0];
      const values = mockedQuery.mock.calls[0][1];

      expect(sql).toContain('completed_at =');
      expect(sql).toContain('error =');
      expect(values).toContain(error);
    });

    it('should return null when execution not found', async () => {
      mockedQuery.mockResolvedValue([]);

      const execution = await repository.updateStatus(
        'non-existent',
        ExecutionStatus.RUNNING
      );

      expect(execution).toBeNull();
    });
  });

  describe('status transitions', () => {
    it('should handle full execution lifecycle', async () => {
      const executionId = 'execution-1';
      
      // PENDING -> RUNNING
      mockedQuery.mockResolvedValueOnce([
        { ...mockExecutionRow, status: ExecutionStatus.RUNNING, attempts: 1 },
      ]);
      let execution = await repository.updateStatus(executionId, ExecutionStatus.RUNNING, {
        attempts: 1,
        startedAt: new Date(),
      });
      expect(execution?.status).toBe(ExecutionStatus.RUNNING);

      // RUNNING -> RETRYING
      mockedQuery.mockResolvedValueOnce([
        { ...mockExecutionRow, status: ExecutionStatus.RETRYING, attempts: 2 },
      ]);
      execution = await repository.updateStatus(executionId, ExecutionStatus.RETRYING, {
        attempts: 2,
      });
      expect(execution?.status).toBe(ExecutionStatus.RETRYING);

      // RETRYING -> SUCCESS
      mockedQuery.mockResolvedValueOnce([
        {
          ...mockExecutionRow,
          status: ExecutionStatus.SUCCESS,
          attempts: 2,
          completedAt: new Date(),
        },
      ]);
      execution = await repository.updateStatus(executionId, ExecutionStatus.SUCCESS, {
        attempts: 2,
        completedAt: new Date(),
        response: { success: true },
      });
      expect(execution?.status).toBe(ExecutionStatus.SUCCESS);
    });
  });
});
