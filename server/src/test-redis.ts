import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // Load .env if it exists

// Connect to Redis. 
// Uses REDIS_URL from .env if present, otherwise defaults to localhost
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function testRedis() {
    console.log('\nStarting Redis Test\n');

    const testKey = 'test_pair:hashA:hashB';
    const testData = { file1: 'A.txt', file2: 'B.txt', score: 0.99 };

    try {
        // 1. SET with Expiry (TTL) - mimicking our PAIR_CACHE_TTL
        console.log(`1. Storing data in Redis at key: "${testKey}"...`);
        // 30 seconds TTL for the test
        await redis.setex(testKey, 30, JSON.stringify(testData));
        console.log('Successfully stored.');

        // 2. GET the data back
        console.log(`\n2. Retrieving data from key: "${testKey}"...`);
        const retrieved = await redis.get(testKey);

        if (retrieved) {
            const parsed = JSON.parse(retrieved);
            console.log('Successfully retrieved:');
            console.log(parsed);
        } else {
            console.log('Failed to retrieve. Got null.');
        }

        // 3. Check TTL (Time To Live)
        console.log('\n3. Checking remaining TTL...');
        const ttl = await redis.ttl(testKey);
        console.log(`Time remaining: ${ttl} seconds`);

        // 4. Delete the key (Cleanup)
        console.log(`\n4. Deleting key: "${testKey}"...`);
        await redis.del(testKey);

        // Verify deletion
        const checkAfterDelete = await redis.get(testKey);
        if (checkAfterDelete === null) {
            console.log('Successfully deleted. Key no longer exists.');
        } else {
            console.log('Failed to delete.');
        }

        console.log('\nRedis Test Complete');

    } catch (error) {
        console.error('\nRedis Error:', error);
    } finally {
        // Close the connection so the script can exit
        redis.quit();
    }
}

testRedis();
