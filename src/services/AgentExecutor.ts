import axios, { AxiosError } from 'axios';
import { Schedule, Execution, ExecutionStatus, RetryPolicy } from '../types';
import { ExecutionRepository } from '../repositories/ExecutionRepository';

export class AgentExecutor {
  private executionRepo: ExecutionRepository;

  constructor() {
    this.executionRepo = new ExecutionRepository();
  }

  /**
   * Execute an agent invocation with retry logic
   */
  async execute(schedule: Schedule, execution: Execution): Promise<void> {
    console.log(
      `[Executor] Starting execution ${execution.id} for schedule ${schedule.name} (${schedule.id})`
    );

    let currentAttempt = 0;
    let lastError: string | undefined;

    while (currentAttempt < schedule.retryPolicy.maxAttempts) {
      currentAttempt++;

      try {
        // Update execution status to RUNNING on first attempt
        if (currentAttempt === 1) {
          await this.executionRepo.updateStatus(execution.id, ExecutionStatus.RUNNING, {
            attempts: currentAttempt,
            startedAt: new Date(),
          });
        } else {
          // Update to RETRYING on subsequent attempts
          await this.executionRepo.updateStatus(execution.id, ExecutionStatus.RETRYING, {
            attempts: currentAttempt,
          });
        }

        // Invoke the agent
        const response = await this.invokeAgent(schedule);

        // Success!
        console.log(
          `[Executor] ✅ Execution ${execution.id} succeeded on attempt ${currentAttempt}`
        );
        await this.executionRepo.updateStatus(execution.id, ExecutionStatus.SUCCESS, {
          attempts: currentAttempt,
          completedAt: new Date(),
          response: response.data,
        });
        return;
      } catch (error) {
        lastError = this.formatError(error);
        console.error(
          `[Executor] ❌ Execution ${execution.id} failed on attempt ${currentAttempt}:`,
          lastError
        );

        // Check if we should retry
        if (currentAttempt < schedule.retryPolicy.maxAttempts) {
          const delay = this.calculateBackoff(currentAttempt, schedule.retryPolicy);
          console.log(`[Executor] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    console.error(
      `[Executor] ⛔ Execution ${execution.id} failed after ${currentAttempt} attempts`
    );
    await this.executionRepo.updateStatus(execution.id, ExecutionStatus.FAILED, {
      attempts: currentAttempt,
      completedAt: new Date(),
      error: lastError,
    });
  }

  /**
   * Invoke the agent via HTTP
   */
  private async invokeAgent(schedule: Schedule): Promise<any> {
    const requestConfig = {
      method: schedule.httpMethod,
      url: schedule.agentUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': schedule.agentId,
        ...schedule.headers,
      },
      data: schedule.payload,
      timeout: 30000, // 30 second timeout
    };

    return await axios(requestConfig);
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number, policy: RetryPolicy): number {
    const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
    return Math.min(delay, policy.maxDelayMs);
  }

  /**
   * Format error message
   */
  private formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        return `HTTP ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data)}`;
      } else if (axiosError.request) {
        return `No response received: ${axiosError.message}`;
      }
      return `Request error: ${axiosError.message}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
