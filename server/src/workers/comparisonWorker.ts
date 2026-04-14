import { Worker, type Job } from 'bullmq';
import { getBullConnection } from '../config/redis.js';
import Group from '../models/Group.js';
import axios from 'axios';
import redisClient from '../config/redis.js';
import { generateAllPairs, pairCacheKey, PAIR_CACHE_TTL } from '../utils/pairCache.js';

export const comparisonWorker = new Worker('comparisons', async (job: Job) => {
    const { groupId } = job.data;

    await job.updateProgress({ step: 'Initializing', percent: 5 });

    const group = await Group.findById(groupId);
    if (!group) {
        throw new Error(`Group not found: ${groupId}`);
    }

    const uniqueHashes = [...new Set(group.files.map(f => f.hash))];

    if (uniqueHashes.length < 2) {
        await job.updateProgress({ step: 'Completed', percent: 100 });
        return [];
    }

    const hashToFilename: Record<string, string> = {};
    const filenameToHash: Record<string, string> = {};
    group.files.forEach(f => {
        hashToFilename[f.hash] = f.filename;
        filenameToHash[f.filename] = f.hash;
    });

    // pair generation
    const allPairs = generateAllPairs(uniqueHashes);
    const cacheKeys = allPairs.map(([a, b]) => pairCacheKey(a, b));

    await job.updateProgress({ step: 'Checking Cache', percent: 10 });

    // Check Redis for cached pairs
    // one redis network round trip for all pairs
    // mget returns an array in the same order as the keys
    // null = cache miss, string = cache hit
    const cachedValues = await redisClient.mget(...cacheKeys);

    // separate hits from misses
    const finalResults: unknown[] = [];
    const missingPairHashes = new Set<string>(); // files involved in at least one miss
    const missingPairsToCompute: Array<[string, string]> = []; // exactly which pairs need computation

    cachedValues.forEach((val: string | null, idx: number) => {
        if (val !== null) {
            // cache hit, add to results directly
            finalResults.push(JSON.parse(val));
        } else {
            // cache miss, store exactly which pair missed
            const [hashA, hashB] = allPairs[idx]!;
            missingPairHashes.add(hashA);
            missingPairHashes.add(hashB);
            missingPairsToCompute.push([hashA, hashB]);
        }
    });

    // full cache hit, every pair found, no computation needed
    if (missingPairHashes.size === 0) {
        console.log(`[Job ${job.id}] Full cache hit for group ${groupId}`);
        await job.updateProgress({ step: 'Completed', percent: 100 });
        return finalResults;
    }

    await job.updateProgress({ step: 'Running ML Engine', percent: 20 });
    console.log(`[Job ${job.id}] Running ML for ${missingPairsToCompute.length} missing pairs...`);

    // extract just the files needed so Chroma only fetches relevant vectors
    const missingHashArray = [...missingPairHashes];
    const fileNames: Record<string, string> = {};
    missingHashArray.forEach(h => {
        fileNames[h] = hashToFilename[h] ?? h;
    });

    try {
        const mlUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
        const mlResponse = await axios.post(`${mlUrl}/compare-group`, {
            hashes: missingHashArray, // for fetching vectors from chromadb
            filenames: fileNames,
            pairs: missingPairsToCompute // the pairs to be calculated when cache miss
        });

        await job.updateProgress({ step: 'Caching Results', percent: 80 });

        // ml-service returns results with file1/file2 as filenames
        // reverse map back to hashes to build the pair cache key
        type MLResult = { file1: string; file2: string; score: number; regions: unknown[] };
        const newResults: MLResult[] = mlResponse.data.results;

        // stores all new pairs in redis, adds them to final res
        // does this in parallel, doesn't wait for one to finish before starting next
        // Promise.all takes an array of promises, returns a new promise that resolves when all of the input promises have resolved
        await Promise.all(
            newResults.map(result => {
                const hashA = filenameToHash[result.file1];
                const hashB = filenameToHash[result.file2];
                if (!hashA || !hashB) return Promise.resolve();
                const key = pairCacheKey(hashA, hashB);
                finalResults.push(result);
                // setex = SET + EXpiry
                return redisClient.setex(key, PAIR_CACHE_TTL, JSON.stringify(result)); // 
            })
        );

        console.log(`[Job ${job.id}] Stored ${newResults.length} pair results`);
        await job.updateProgress({ step: 'Completed', percent: 100 });

        return finalResults;

    } catch (mlError) {
        console.error(`[Job ${job.id}] ml-service comparison failed:`, mlError);
        throw new Error('Failed to communicate with ML service');
    }

}, {
    connection: getBullConnection(),
    concurrency: 2 // Handle up to 2 group processing tasks simultaneously
});

comparisonWorker.on('completed', job => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
});

comparisonWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
});
