import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client';
import { Execution, ExecutionStatus } from '../types';

export class ExecutionRepository {
  async findByScheduleId(scheduleId: string, limit = 50): Promise<Execution[]> {
    const rows = await query(
      `SELECT id, schedule_id as "scheduleId", fire_time as "fireTime", status, attempts,
              started_at as "startedAt", completed_at as "completedAt", error, response
       FROM executions 
       WHERE schedule_id = $1
       ORDER BY fire_time DESC
       LIMIT $2`,
      [scheduleId, limit]
    );
    return rows.map(this.mapRow);
  }

  async findById(id: string): Promise<Execution | null> {
    const rows = await query(
      `SELECT id, schedule_id as "scheduleId", fire_time as "fireTime", status, attempts,
              started_at as "startedAt", completed_at as "completedAt", error, response
       FROM executions 
       WHERE id = $1`,
      [id]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async create(scheduleId: string, fireTime: Date): Promise<Execution> {
    const id = uuidv4();
    const rows = await query(
      `INSERT INTO executions (id, schedule_id, fire_time, status, attempts)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, schedule_id as "scheduleId", fire_time as "fireTime", status, attempts,
                 started_at as "startedAt", completed_at as "completedAt", error, response`,
      [id, scheduleId, fireTime, ExecutionStatus.PENDING, 0]
    );
    return this.mapRow(rows[0]);
  }

  async updateStatus(
    id: string,
    status: ExecutionStatus,
    data?: {
      attempts?: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      response?: any;
    }
  ): Promise<Execution | null> {
    const updates: string[] = ['status = $2'];
    const values: any[] = [id, status];
    let paramIndex = 3;

    if (data?.attempts !== undefined) {
      updates.push(`attempts = $${paramIndex++}`);
      values.push(data.attempts);
    }
    if (data?.startedAt !== undefined) {
      updates.push(`started_at = $${paramIndex++}`);
      values.push(data.startedAt);
    }
    if (data?.completedAt !== undefined) {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(data.completedAt);
    }
    if (data?.error !== undefined) {
      updates.push(`error = $${paramIndex++}`);
      values.push(data.error);
    }
    if (data?.response !== undefined) {
      updates.push(`response = $${paramIndex++}`);
      values.push(JSON.stringify(data.response));
    }

    const rows = await query(
      `UPDATE executions 
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, schedule_id as "scheduleId", fire_time as "fireTime", status, attempts,
                 started_at as "startedAt", completed_at as "completedAt", error, response`,
      values
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  private mapRow(row: any): Execution {
    return {
      id: row.id,
      scheduleId: row.scheduleId,
      fireTime: row.fireTime,
      status: row.status,
      attempts: row.attempts,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      error: row.error,
      response: row.response,
    };
  }
}
