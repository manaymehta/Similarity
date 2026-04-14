import express, { Router } from 'express';
import { getJobStatus } from '../controllers/jobsController.js';

const router: Router = express.Router();

router.get('/:jobId/status', getJobStatus); //api/jobs/:jobId/status

export default router;
