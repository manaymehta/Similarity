import { Queue } from 'bullmq';
import { getBullConnection } from '../config/redis.js';

export const comparisonQueue = new Queue('comparisons', {
    connection: getBullConnection()
});

// connection: getBullConnection() is used to get the connection to the redis server
// then passed to bullmq in the file comparisonWorker.ts
// it is used to queue up the comparison jobs
// comparisonQueue is used to queue up the comparison jobs
// comparisonWorker is used to process the comparison jobs, separate process running in background

