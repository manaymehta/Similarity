import { Redis } from 'ioredis';

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
});

redisClient.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
});

// BullMQ requires maxRetriesPerRequest to be null, its handling its own retry logic, 
// because bullmqs retry logic is not compatible with the way we are using redis, 
// we are using redis for multiple purposes, not just for BullMQ, so 
export const getBullConnection = () => {
    return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null
    });
}

export default redisClient;
// creates a connection to the redis server, exports it as a singleton instance
// exports a function to get a new connection to the redis server used by BullMQ