import type { Request, Response } from 'express';
import Group from '../models/Group.js';
import Document from '../models/Document.js';
import { getChromaCollection } from '../utils/chromaClient.js';
import redisClient from '../config/redis.js';

interface RedisPairData {
    key: string;
    file1: string;
    file2: string;
    ttl: number;
}

export const getSystemMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
        // MongoDB Metrics
        const groupCount = await Group.countDocuments();
        const documentCount = await Document.countDocuments();

        // ChromaDB Metrics
        let chromaChunkCount = 0;
        try {
            const collection = await getChromaCollection();
            chromaChunkCount = await collection.count();
        } catch (chromaErr) {
            console.error('[SystemController] Chroma fetch failed:', chromaErr);
        }

        // Redis Metrics
        const redisKeys = await redisClient.keys('pair:*');
        const redisPairs: RedisPairData[] = [];

        // Reverse hash map using Document collection
        // We grab all hashes in redis to do a single Mongo fetch
        const uniqueHashes = new Set<string>();
        redisKeys.forEach(key => {
            const parts = key.split(':');
            if (parts.length === 3) {
                uniqueHashes.add(parts[1]!);
                uniqueHashes.add(parts[2]!);
            }
        });

        // Fetch filenames for these hashes
        const docs = await Document.find({ hash: { $in: Array.from(uniqueHashes) } }, 'hash filename').lean();
        const hashToFilename: Record<string, string> = {};
        docs.forEach(d => {
            if (d.hash && d.filename) {
                hashToFilename[d.hash] = d.filename;
            }
        });

        // Assemble redis pair data
        for (const key of redisKeys) {
            const ttl = await redisClient.ttl(key);
            const parts = key.split(':');
            
            let file1 = 'Unknown';
            let file2 = 'Unknown';
            
            if (parts.length === 3) {
                file1 = hashToFilename[parts[1]!] || parts[1]!;
                file2 = hashToFilename[parts[2]!] || parts[2]!;
            }

            redisPairs.push({
                key,
                file1,
                file2,
                ttl
            });
        }

        res.json({
            mongodb: {
                groups: groupCount,
                documents: documentCount
            },
            chromadb: {
                chunks: chromaChunkCount
            },
            redis: {
                totalPairsCached: redisPairs.length,
                pairs: redisPairs
            }
        });

    } catch (error) {
        console.error('[SystemController] Error fetching metrics:', error);
        res.status(500).json({ message: 'Internal server error while fetching system metrics', error });
    }
};
