import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { redisClient } from './services/RedisClient';
import { DistributedScheduler } from './services/DistributedScheduler';
import schedulesRouter from './api/schedules';
import healthRouter from './api/health';

const app = express();
const scheduler = new DistributedScheduler();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/schedules', schedulesRouter);
app.use('/api/health', healthRouter);

// Serve static UI files
app.use(express.static(path.join(__dirname, '../ui')));

// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../ui/index.html'));
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');

  try {
    await scheduler.stop();
    await redisClient.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function start() {
  try {
    console.log('🚀 Starting Distributed Scheduler Service...\n');

    // Connect to Redis
    console.log('Connecting to Redis...');
    await redisClient.connect();

    // Start the scheduler
    await scheduler.start();

    // Start HTTP server
    app.listen(config.server.port, () => {
      console.log(`\n✅ Server running on port ${config.server.port}`);
      console.log(`📊 Health check: http://localhost:${config.server.port}/api/health`);
      console.log(`🌐 UI: http://localhost:${config.server.port}`);
      console.log(`📡 API: http://localhost:${config.server.port}/api/schedules\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
