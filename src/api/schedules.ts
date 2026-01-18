import { Router, Request, Response } from 'express';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { ExecutionRepository } from '../repositories/ExecutionRepository';
import { validateCreate, validateUpdate } from '../utils/validation';
import { z } from 'zod';

const router = Router();
const scheduleRepo = new ScheduleRepository();
const executionRepo = new ExecutionRepository();

// Get all schedules
router.get('/', async (_req: Request, res: Response) => {
  try {
    const schedules = await scheduleRepo.findAll();
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch schedules' });
  }
});

// Get schedule by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const schedule = await scheduleRepo.findById(req.params.id);
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' });
      return;
    }
    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch schedule' });
  }
});

// Get executions for a schedule
router.get('/:id/executions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const executions = await executionRepo.findByScheduleId(req.params.id, limit);
    res.json({ success: true, data: executions });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch executions' });
  }
});

// Create schedule
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = validateCreate(req.body);
    const schedule = await scheduleRepo.create(validated);
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }
    console.error('Error creating schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to create schedule' });
  }
});

// Update schedule
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = validateUpdate(req.body);
    const schedule = await scheduleRepo.update(req.params.id, validated);
    if (!schedule) {
      res.status(404).json({ success: false, error: 'Schedule not found' });
      return;
    }
    res.json({ success: true, data: schedule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }
    console.error('Error updating schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
});

// Delete schedule
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await scheduleRepo.delete(req.params.id);
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to delete schedule' });
  }
});

export default router;
