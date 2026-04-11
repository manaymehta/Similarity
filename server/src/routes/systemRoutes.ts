import express, { Router } from 'express';
import { getSystemMetrics } from '../controllers/systemController.js';

const router: Router = express.Router();

// GET /api/system/stats
router.get('/stats', getSystemMetrics);

export default router;
