import { Redis } from 'ioredis';

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
});

redisClient.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
});

export default redisClient;
