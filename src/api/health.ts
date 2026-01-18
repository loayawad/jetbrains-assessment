import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { redisClient } from '../services/RedisClient';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');

    // Check Redis connection
    await redisClient.ping();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable',
    });
  }
});

export default router;
