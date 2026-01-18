import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client';
import { Schedule, CreateScheduleRequest, UpdateScheduleRequest, RetryPolicy } from '../types';

export class ScheduleRepository {
  async findAll(): Promise<Schedule[]> {
    const rows = await query(
      `SELECT id, name, cron_expression as "cronExpression", agent_id as "agentId", 
              agent_url as "agentUrl", http_method as "httpMethod", headers, payload, 
              retry_policy as "retryPolicy", enabled, created_at as "createdAt", 
              updated_at as "updatedAt"
       FROM schedules 
       ORDER BY created_at DESC`
    );
    return rows.map(this.mapRow);
  }

  async findById(id: string): Promise<Schedule | null> {
    const rows = await query(
      `SELECT id, name, cron_expression as "cronExpression", agent_id as "agentId",
              agent_url as "agentUrl", http_method as "httpMethod", headers, payload,
              retry_policy as "retryPolicy", enabled, created_at as "createdAt",
              updated_at as "updatedAt"
       FROM schedules 
       WHERE id = $1`,
      [id]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findEnabled(): Promise<Schedule[]> {
    const rows = await query(
      `SELECT id, name, cron_expression as "cronExpression", agent_id as "agentId",
              agent_url as "agentUrl", http_method as "httpMethod", headers, payload,
              retry_policy as "retryPolicy", enabled, created_at as "createdAt",
              updated_at as "updatedAt"
       FROM schedules 
       WHERE enabled = true
       ORDER BY created_at DESC`
    );
    return rows.map(this.mapRow);
  }

  async create(data: CreateScheduleRequest): Promise<Schedule> {
    const id = uuidv4();
    const retryPolicy: RetryPolicy = {
      maxAttempts: data.retryPolicy?.maxAttempts ?? 3,
      backoffMultiplier: data.retryPolicy?.backoffMultiplier ?? 2,
      initialDelayMs: data.retryPolicy?.initialDelayMs ?? 1000,
      maxDelayMs: data.retryPolicy?.maxDelayMs ?? 30000,
    };

    const rows = await query(
      `INSERT INTO schedules (id, name, cron_expression, agent_id, agent_url, http_method, 
                              headers, payload, retry_policy, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, cron_expression as "cronExpression", agent_id as "agentId",
                 agent_url as "agentUrl", http_method as "httpMethod", headers, payload,
                 retry_policy as "retryPolicy", enabled, created_at as "createdAt",
                 updated_at as "updatedAt"`,
      [
        id,
        data.name,
        data.cronExpression,
        data.agentId,
        data.agentUrl,
        data.httpMethod || 'POST',
        JSON.stringify(data.headers || {}),
        JSON.stringify(data.payload || {}),
        JSON.stringify(retryPolicy),
        data.enabled ?? true,
      ]
    );
    return this.mapRow(rows[0]);
  }

  async update(id: string, data: UpdateScheduleRequest): Promise<Schedule | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.cronExpression !== undefined) {
      updates.push(`cron_expression = $${paramIndex++}`);
      values.push(data.cronExpression);
    }
    if (data.agentId !== undefined) {
      updates.push(`agent_id = $${paramIndex++}`);
      values.push(data.agentId);
    }
    if (data.agentUrl !== undefined) {
      updates.push(`agent_url = $${paramIndex++}`);
      values.push(data.agentUrl);
    }
    if (data.httpMethod !== undefined) {
      updates.push(`http_method = $${paramIndex++}`);
      values.push(data.httpMethod);
    }
    if (data.headers !== undefined) {
      updates.push(`headers = $${paramIndex++}`);
      values.push(JSON.stringify(data.headers));
    }
    if (data.payload !== undefined) {
      updates.push(`payload = $${paramIndex++}`);
      values.push(JSON.stringify(data.payload));
    }
    if (data.retryPolicy !== undefined) {
      const retryPolicy: RetryPolicy = {
        maxAttempts: data.retryPolicy.maxAttempts ?? existing.retryPolicy.maxAttempts,
        backoffMultiplier:
          data.retryPolicy.backoffMultiplier ?? existing.retryPolicy.backoffMultiplier,
        initialDelayMs: data.retryPolicy.initialDelayMs ?? existing.retryPolicy.initialDelayMs,
        maxDelayMs: data.retryPolicy.maxDelayMs ?? existing.retryPolicy.maxDelayMs,
      };
      updates.push(`retry_policy = $${paramIndex++}`);
      values.push(JSON.stringify(retryPolicy));
    }
    if (data.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(data.enabled);
    }

    if (updates.length === 0) return existing;

    values.push(id);
    const rows = await query(
      `UPDATE schedules 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, cron_expression as "cronExpression", agent_id as "agentId",
                 agent_url as "agentUrl", http_method as "httpMethod", headers, payload,
                 retry_policy as "retryPolicy", enabled, created_at as "createdAt",
                 updated_at as "updatedAt"`,
      values
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(`DELETE FROM schedules WHERE id = $1`, [id]);
    return result.length > 0;
  }

  private mapRow(row: any): Schedule {
    return {
      id: row.id,
      name: row.name,
      cronExpression: row.cronExpression,
      agentId: row.agentId,
      agentUrl: row.agentUrl,
      httpMethod: row.httpMethod,
      headers: row.headers,
      payload: row.payload,
      retryPolicy: row.retryPolicy,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
