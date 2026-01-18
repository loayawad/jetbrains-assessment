export interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  agentId: string;
  agentUrl: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  payload?: Record<string, any>;
  retryPolicy: RetryPolicy;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMultiplier: number; // Exponential backoff multiplier
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface Execution {
  id: string;
  scheduleId: string;
  fireTime: Date;
  status: ExecutionStatus;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  response?: any;
}

export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

export interface CreateScheduleRequest {
  name: string;
  cronExpression: string;
  agentId: string;
  agentUrl: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  payload?: Record<string, any>;
  retryPolicy?: Partial<RetryPolicy>;
  enabled?: boolean;
}

export interface UpdateScheduleRequest extends Partial<CreateScheduleRequest> {}
