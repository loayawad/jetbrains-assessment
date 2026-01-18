import { ScheduleRepository } from '../ScheduleRepository';
import { query } from '../../db/client';
import { CreateScheduleRequest, UpdateScheduleRequest } from '../../types';

// Mock database client
jest.mock('../../db/client');
const mockedQuery = query as jest.MockedFunction<typeof query>;

describe('ScheduleRepository', () => {
  let repository: ScheduleRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ScheduleRepository();
  });

  const mockScheduleRow = {
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
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  describe('findAll', () => {
    it('should return all schedules', async () => {
      mockedQuery.mockResolvedValue([mockScheduleRow]);

      const schedules = await repository.findAll();

      expect(schedules).toHaveLength(1);
      expect(schedules[0].id).toBe('schedule-1');
      expect(schedules[0].name).toBe('Test Schedule');
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
    });

    it('should return empty array when no schedules exist', async () => {
      mockedQuery.mockResolvedValue([]);

      const schedules = await repository.findAll();

      expect(schedules).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('should return schedule by id', async () => {
      mockedQuery.mockResolvedValue([mockScheduleRow]);

      const schedule = await repository.findById('schedule-1');

      expect(schedule).not.toBeNull();
      expect(schedule?.id).toBe('schedule-1');
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['schedule-1']
      );
    });

    it('should return null when schedule not found', async () => {
      mockedQuery.mockResolvedValue([]);

      const schedule = await repository.findById('non-existent');

      expect(schedule).toBeNull();
    });
  });

  describe('findEnabled', () => {
    it('should return only enabled schedules', async () => {
      mockedQuery.mockResolvedValue([mockScheduleRow]);

      const schedules = await repository.findEnabled();

      expect(schedules).toHaveLength(1);
      expect(schedules[0].enabled).toBe(true);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE enabled = true')
      );
    });
  });

  describe('create', () => {
    it('should create a new schedule with defaults', async () => {
      const createData: CreateScheduleRequest = {
        name: 'New Schedule',
        cronExpression: '0 9 * * *',
        agentId: 'agent-1',
        agentUrl: 'https://example.com/api',
      };

      mockedQuery.mockResolvedValue([mockScheduleRow]);

      const schedule = await repository.create(createData);

      expect(schedule).toBeDefined();
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO schedules'),
        expect.arrayContaining([
          expect.any(String), // id (uuid)
          'New Schedule',
          '0 9 * * *',
          'agent-1',
          'https://example.com/api',
          'POST', // default httpMethod
          '{}', // default headers
          '{}', // default payload
          expect.any(String), // retry policy JSON
          true, // default enabled
        ])
      );
    });

    it('should create schedule with custom retry policy', async () => {
      const createData: CreateScheduleRequest = {
        name: 'Custom Retry',
        cronExpression: '* * * * *',
        agentId: 'agent-1',
        agentUrl: 'https://example.com/api',
        retryPolicy: {
          maxAttempts: 5,
          backoffMultiplier: 3,
          initialDelayMs: 2000,
          maxDelayMs: 60000,
        },
      };

      mockedQuery.mockResolvedValue([mockScheduleRow]);

      await repository.create(createData);

      const callArgs = mockedQuery.mock.calls[0][1];
      const retryPolicyJson = callArgs?.[8];
      const retryPolicy = JSON.parse(retryPolicyJson);

      expect(retryPolicy.maxAttempts).toBe(5);
      expect(retryPolicy.backoffMultiplier).toBe(3);
      expect(retryPolicy.initialDelayMs).toBe(2000);
      expect(retryPolicy.maxDelayMs).toBe(60000);
    });

    it('should create schedule with custom headers and payload', async () => {
      const createData: CreateScheduleRequest = {
        name: 'With Headers',
        cronExpression: '* * * * *',
        agentId: 'agent-1',
        agentUrl: 'https://example.com/api',
        headers: { Authorization: 'Bearer token' },
        payload: { key: 'value' },
      };

      mockedQuery.mockResolvedValue([mockScheduleRow]);

      await repository.create(createData);

      const callArgs = mockedQuery.mock.calls[0][1];
      expect(callArgs?.[6]).toBe('{"Authorization":"Bearer token"}');
      expect(callArgs?.[7]).toBe('{"key":"value"}');
    });
  });

  describe('update', () => {
    it('should update schedule fields', async () => {
      // Mock findById
      mockedQuery
        .mockResolvedValueOnce([mockScheduleRow]) // findById
        .mockResolvedValueOnce([{ ...mockScheduleRow, enabled: false }]); // update

      const updateData: UpdateScheduleRequest = {
        enabled: false,
      };

      const updated = await repository.update('schedule-1', updateData);

      expect(updated).not.toBeNull();
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE schedules'),
        expect.arrayContaining([false, 'schedule-1'])
      );
    });

    it('should return null when schedule not found', async () => {
      mockedQuery.mockResolvedValue([]); // findById returns empty

      const updated = await repository.update('non-existent', { enabled: false });

      expect(updated).toBeNull();
    });

    it('should return existing schedule when no updates provided', async () => {
      mockedQuery.mockResolvedValue([mockScheduleRow]);

      const updated = await repository.update('schedule-1', {});

      expect(updated).toEqual(expect.objectContaining({
        id: 'schedule-1',
        name: 'Test Schedule',
      }));
      // Should only call findById, not UPDATE
      expect(mockedQuery).toHaveBeenCalledTimes(1);
    });

    it('should update multiple fields', async () => {
      mockedQuery
        .mockResolvedValueOnce([mockScheduleRow])
        .mockResolvedValueOnce([mockScheduleRow]);

      const updateData: UpdateScheduleRequest = {
        name: 'Updated Name',
        enabled: false,
        cronExpression: '0 10 * * *',
      };

      await repository.update('schedule-1', updateData);

      const updateCall = mockedQuery.mock.calls[1];
      const sql = updateCall[0];
      const values = updateCall[1];

      expect(sql).toContain('UPDATE schedules');
      expect(sql).toContain('name =');
      expect(sql).toContain('enabled =');
      expect(sql).toContain('cron_expression =');
      expect(values).toContain('Updated Name');
      expect(values).toContain(false);
      expect(values).toContain('0 10 * * *');
    });
  });

  describe('delete', () => {
    it('should delete schedule by id', async () => {
      mockedQuery.mockResolvedValue([{ id: 'schedule-1' }]);

      const result = await repository.delete('schedule-1');

      expect(result).toBe(true);
      expect(mockedQuery).toHaveBeenCalledWith(
        'DELETE FROM schedules WHERE id = $1',
        ['schedule-1']
      );
    });

    it('should return false when schedule not found', async () => {
      mockedQuery.mockResolvedValue([]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });
});
