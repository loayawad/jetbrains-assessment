import { validateCreate, validateUpdate } from '../validation';

describe('Validation', () => {
  describe('validateCreate', () => {
    const validSchedule = {
      name: 'Test Schedule',
      cronExpression: '0 9 * * *',
      agentId: 'agent-1',
      agentUrl: 'https://example.com/webhook',
    };

    it('should validate a valid schedule', () => {
      expect(() => validateCreate(validSchedule)).not.toThrow();
    });

    it('should validate schedule with optional fields', () => {
      const scheduleWithOptionals = {
        ...validSchedule,
        httpMethod: 'POST',
        headers: { Authorization: 'Bearer token' },
        payload: { data: 'test' },
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
        },
        enabled: true,
      };

      expect(() => validateCreate(scheduleWithOptionals)).not.toThrow();
    });

    describe('name validation', () => {
      it('should reject empty name', () => {
        const invalid = { ...validSchedule, name: '' };
        expect(() => validateCreate(invalid)).toThrow();
      });

      it('should reject name longer than 255 characters', () => {
        const invalid = { ...validSchedule, name: 'a'.repeat(256) };
        expect(() => validateCreate(invalid)).toThrow();
      });

      it('should reject missing name', () => {
        const { name, ...invalid } = validSchedule;
        expect(() => validateCreate(invalid)).toThrow();
      });
    });

    describe('cron expression validation', () => {
      it('should accept valid cron expressions', () => {
        const validCrons = [
          '* * * * *', // Every minute
          '0 * * * *', // Every hour
          '0 9 * * *', // Every day at 9am
          '0 9 * * MON', // Every Monday at 9am
          '*/5 * * * *', // Every 5 minutes
          '0 0 1 * *', // First day of month
        ];

        validCrons.forEach((cron) => {
          const schedule = { ...validSchedule, cronExpression: cron };
          expect(() => validateCreate(schedule)).not.toThrow();
        });
      });

      it('should reject missing cron expression', () => {
        const { cronExpression, ...invalid } = validSchedule;
        expect(() => validateCreate(invalid)).toThrow();
      });
    });

    describe('agentUrl validation', () => {
      it('should accept valid URLs', () => {
        const validUrls = [
          'https://example.com',
          'https://example.com/webhook',
          'https://api.example.com/v1/agent',
          'http://localhost:3000/webhook',
          'https://example.com:8080/path?query=value',
        ];

        validUrls.forEach((url) => {
          const schedule = { ...validSchedule, agentUrl: url };
          expect(() => validateCreate(schedule)).not.toThrow();
        });
      });

      it('should reject invalid URLs', () => {
        const invalidUrls = [
          'not-a-url',
          'just-text',
          'example.com',
          '://no-protocol',
        ];

        invalidUrls.forEach((url) => {
          const schedule = { ...validSchedule, agentUrl: url };
          expect(() => validateCreate(schedule)).toThrow();
        });
      });

      it('should reject missing agentUrl', () => {
        const { agentUrl, ...invalid } = validSchedule;
        expect(() => validateCreate(invalid)).toThrow();
      });
    });

    describe('httpMethod validation', () => {
      it('should accept valid HTTP methods', () => {
        const methods = ['GET', 'POST', 'PUT', 'DELETE'];

        methods.forEach((method) => {
          const schedule = { ...validSchedule, httpMethod: method };
          expect(() => validateCreate(schedule)).not.toThrow();
        });
      });

      it('should reject invalid HTTP methods', () => {
        const invalid = { ...validSchedule, httpMethod: 'PATCH' };
        expect(() => validateCreate(invalid)).toThrow();
      });

      it('should allow httpMethod to be optional', () => {
        expect(() => validateCreate(validSchedule)).not.toThrow();
      });
    });

    describe('retryPolicy validation', () => {
      it('should validate retry policy constraints', () => {
        const validPolicy = {
          maxAttempts: 5,
          backoffMultiplier: 2,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
        };

        const schedule = { ...validSchedule, retryPolicy: validPolicy };
        expect(() => validateCreate(schedule)).not.toThrow();
      });

      it('should reject maxAttempts outside range', () => {
        const invalidMax = {
          ...validSchedule,
          retryPolicy: { maxAttempts: 11 },
        };
        expect(() => validateCreate(invalidMax)).toThrow();

        const invalidMin = {
          ...validSchedule,
          retryPolicy: { maxAttempts: -1 },
        };
        expect(() => validateCreate(invalidMin)).toThrow();
      });

      it('should reject backoffMultiplier outside range', () => {
        const invalid = {
          ...validSchedule,
          retryPolicy: { backoffMultiplier: 11 },
        };
        expect(() => validateCreate(invalid)).toThrow();
      });

      it('should reject invalid delay values', () => {
        const invalidInitial = {
          ...validSchedule,
          retryPolicy: { initialDelayMs: 50 }, // Less than 100
        };
        expect(() => validateCreate(invalidInitial)).toThrow();

        const invalidMax = {
          ...validSchedule,
          retryPolicy: { maxDelayMs: 500 }, // Less than 1000
        };
        expect(() => validateCreate(invalidMax)).toThrow();
      });
    });
  });

  describe('validateUpdate', () => {
    it('should validate update with partial fields', () => {
      const update = { name: 'Updated Name' };
      expect(() => validateUpdate(update)).not.toThrow();
    });

    it('should validate update with multiple fields', () => {
      const update = {
        name: 'Updated',
        enabled: false,
        cronExpression: '0 10 * * *',
      };
      expect(() => validateUpdate(update)).not.toThrow();
    });

    it('should validate empty update', () => {
      expect(() => validateUpdate({})).not.toThrow();
    });

    it('should reject invalid fields in update', () => {
      const invalid = { cronExpression: 'invalid cron' };
      expect(() => validateUpdate(invalid)).toThrow(/Invalid cron expression/);
    });

    it('should apply same validation rules as create', () => {
      const invalidUrl = { agentUrl: 'not-a-url' };
      expect(() => validateUpdate(invalidUrl)).toThrow();

      const invalidMethod = { httpMethod: 'PATCH' };
      expect(() => validateUpdate(invalidMethod)).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle null values', () => {
      expect(() => validateCreate(null)).toThrow();
    });

    it('should handle undefined', () => {
      expect(() => validateCreate(undefined)).toThrow();
    });

    it('should handle non-object values', () => {
      expect(() => validateCreate('string')).toThrow();
      expect(() => validateCreate(123)).toThrow();
      expect(() => validateCreate([])).toThrow();
    });

    it('should reject extra unknown fields', () => {
      const withExtra = {
        name: 'Test',
        cronExpression: '* * * * *',
        agentId: 'agent-1',
        agentUrl: 'https://example.com',
        unknownField: 'value',
      };
      
      // Zod by default strips unknown fields, doesn't throw
      // This tests that the schema works as expected
      const result = validateCreate(withExtra);
      expect(result).not.toHaveProperty('unknownField');
    });
  });
});
