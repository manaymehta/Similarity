import type { Request, Response } from 'express';
import { comparisonQueue } from '../queues/comparisonQueue.js';

export const getJobStatus = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        if (!jobId) {
            res.status(400).json({ message: 'Job ID is required' });
            return;
        }

        const job = await comparisonQueue.getJob(jobId);

        if (!job) {
            res.status(404).json({ message: 'Job not found' });
            return;
        }

        const state = await job.getState();
        const progress = job.progress;
        const result = job.returnvalue;
        const failedReason = job.failedReason;

        res.json({
            id: job.id,
            state, // 'waiting', 'active', 'completed', 'failed', 'delayed', etc.
            progress,
            result,
            failedReason
        });
    } catch (err) {
        console.error('Error fetching job status:', err);
        res.status(500).json({ message: 'Internal server error while fetching job status' });
    }
};
