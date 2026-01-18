import { z } from 'zod';
import parser from 'cron-parser';

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(0).max(10).optional(),
  backoffMultiplier: z.number().min(1).max(10).optional(),
  initialDelayMs: z.number().int().min(100).optional(),
  maxDelayMs: z.number().int().min(1000).optional(),
});

export const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  cronExpression: z.string().refine(
    (cron) => {
      try {
        parser.parseExpression(cron);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid cron expression' }
  ),
  agentId: z.string().min(1).max(255),
  agentUrl: z.string().url(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  headers: z.record(z.string()).optional(),
  payload: z.record(z.any()).optional(),
  retryPolicy: RetryPolicySchema.optional(),
  enabled: z.boolean().optional(),
});

export const UpdateScheduleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  cronExpression: z
    .string()
    .refine(
      (cron) => {
        try {
          parser.parseExpression(cron);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid cron expression' }
    )
    .optional(),
  agentId: z.string().min(1).max(255).optional(),
  agentUrl: z.string().url().optional(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  headers: z.record(z.string()).optional(),
  payload: z.record(z.any()).optional(),
  retryPolicy: RetryPolicySchema.optional(),
  enabled: z.boolean().optional(),
});

export function validateCreate(data: unknown) {
  return CreateScheduleSchema.parse(data);
}

export function validateUpdate(data: unknown) {
  return UpdateScheduleSchema.parse(data);
}
