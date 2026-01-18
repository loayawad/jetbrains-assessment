import { createClient } from 'redis';
import { config } from '../config';

export class RedisClient {
  private client: ReturnType<typeof createClient>;
  private connected = false;

  constructor() {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('✅ Connected to Redis');
      this.connected = true;
    });
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }

  /**
   * Acquire a distributed lock using Redis SET NX with TTL
   * Returns true if lock was acquired, false otherwise
   */
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, '1', {
        NX: true, // Only set if key doesn't exist
        PX: ttlMs, // TTL in milliseconds
      });
      return result === 'OK';
    } catch (error) {
      console.error('Error acquiring lock:', error);
      return false;
    }
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Error releasing lock:', error);
    }
  }

  /**
   * Check if a lock exists
   */
  async hasLock(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Error checking lock:', error);
      return false;
    }
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }
}

export const redisClient = new RedisClient();
