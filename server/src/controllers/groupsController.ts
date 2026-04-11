import { type Request, type Response } from 'express';
import Group from '../models/Group.js';
import Document from '../models/Document.js';
import { computeHash } from '../utils/hash.js';
import { getChromaCollection } from '../utils/chromaClient.js';
import axios from 'axios';
import redisClient from '../config/redis.js';

// time to live for the pair cache in seconds
const PAIR_CACHE_TTL = 7 * 24 * 3600;

// same redis key for a file pair regardless of argument order
function pairCacheKey(hashA: string, hashB: string): string {
    return `pair:${[hashA, hashB].sort().join(':')}`;
    // output: pair:hash1:hash2, pair is just a prefix to identify the key
}

// Generates all unique N*(N-1)/2 pairs from an array of hashes.
function generateAllPairs(hashes: string[]): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < hashes.length; i++) {
        for (let j = i + 1; j < hashes.length; j++) {
            pairs.push([hashes[i]!, hashes[j]!]);
        }
    }
    return pairs;
}

interface MLChunk {
    vector: number[];
    text: string;
    chunk_index: number;
    start_char: number;
    end_char: number;
}   // containing the vector embedding of a chunk

interface MLEncodeResponse {
    chunks: MLChunk[];
}   // response from the ml-service containing the chunks of the document


export const createGroup = async (req: Request, res: Response) => {
    try {
        const files = req.files as Express.Multer.File[];
        const { groupName } = req.body;

        if (!files || files.length === 0) {
            res.status(400).json({ message: 'No files uploaded' });
            return;
        }

        const processedFiles: { hash: string; filename: string }[] = [];
        const chromadb = await getChromaCollection();

        for (const file of files) {
            const content = file.buffer.toString('utf-8');
            const hash = computeHash(content);

            const existingDoc = await Document.findOne({ hash });

            if (!existingDoc) {
                try {
                    // call ml-service
                    const mlUrl = process.env.ML_SERVICE_URL || 'http://ml-service:5001';
                    const mlRes = await axios.post<MLEncodeResponse>(`${mlUrl}/encode`, {
                        document: {
                            filename: file.originalname,
                            content: content
                        }
                    });

                    const chunks = mlRes.data.chunks;

                    const newDoc = new Document({
                        hash,
                        filename: file.originalname,
                        fullText: content,
                        chunkCount: chunks.length
                    });
                    await newDoc.save(); // save to mongodb

                    if (chunks.length > 0) {
                        await chromadb.add({
                            ids: chunks.map(c => `${hash}_${c.chunk_index}`),
                            embeddings: chunks.map(c => c.vector),
                            metadatas: chunks.map(c => ({
                                file_hash: hash,
                                chunk_index: c.chunk_index,
                                text_snippet: c.text,
                                start_char: c.start_char,
                                end_char: c.end_char
                            }))
                        }); // save to chromadb
                    }
                    console.log(`Encoded and saved ${file.originalname} (${hash})`);

                } catch (mlError) {
                    console.error(`ML Service Failed for ${file.originalname}:`, mlError);
                    continue;
                }
            } else {
                console.log(`Using existing ${file.originalname} (${hash})`);
            }

            processedFiles.push({ hash, filename: file.originalname });
        }

        const group = await Group.create({
            name: groupName || `Group - ${new Date().toLocaleDateString()}`,
            files: processedFiles,
            status: 'completed'
        });

        res.status(201).json(group);

    } catch (error) {
        console.error('Create Group Error:', error);
        res.status(500).json({ message: 'Server Error creating group', error: error });
    }
};

export const getGroups = async (req: Request, res: Response) => {
    try {
        const groups = await Group.find().sort({ createdAt: -1 });
        res.json(groups);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching groups', error: error });
    }
};

export const getGroupDetails = async (req: Request, res: Response) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }
        res.json(group);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching group', error: error });
    }
};

// Groups

export const deleteGroup = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Find group to get file hashes before deletion
        const group = await Group.findById(id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }

        const fileHashes = group.files.map(f => f.hash);

        // redis keys are based on file content hashes, not group IDs
        // other groups having these files can still use cached pair results from redis
        // TTL handles eventual cleanup

        // delete the Group
        await Group.findByIdAndDelete(id);

        const chromadb = await getChromaCollection();
        let cleanedCount = 0;

        for (const hash of fileHashes) {
            // checks for files not used in any group
            const usageCount = await Group.countDocuments({ "files.hash": hash });

            if (usageCount === 0) {
                // if file not used in any group, delete from mongodb and chromadb
                await Document.deleteOne({ hash });

                try {
                    await chromadb.delete({
                        where: { file_hash: hash }
                    });
                } catch (chromaError) {
                    console.error(`Failed to delete vectors for hash ${hash}:`, chromaError);
                }

                // purge all redis pair cache entries that reference this hash
                // key format is pair:hashA:hashB (sorted), so hash could appear in either position
                const staleKeys = await redisClient.keys(`pair:*${hash}*`);
                if (staleKeys.length > 0) {
                    await redisClient.del(...staleKeys);
                    console.log(`[Cleanup] Purged ${staleKeys.length} stale Redis pair(s) for hash: ${hash.slice(0, 8)}...`);
                }

                console.log(`[Cleanup] Deleted orphaned file data for hash: ${hash}`);
                cleanedCount++;
            }
        }

        res.json({ message: `Group deleted. Cleaned up ${cleanedCount} orphaned files.` });

    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ message: 'Error deleting group' });
    }
};

export const addFilesToGroup = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            res.status(400).json({ message: 'No files uploaded' });
            return;
        }

        const group = await Group.findById(id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }

        const chromadb = await getChromaCollection();
        const newProcessedFiles: { hash: string; filename: string }[] = [];

        for (const file of files) {
            const content = file.buffer.toString('utf-8');
            const hash = computeHash(content);

            if (group.files.some(f => f.hash === hash)) {
                // skip if file already in group
                continue;
            }

            const existingDoc = await Document.findOne({ hash });

            if (!existingDoc) {
                // converting text to vectors and save to mongodb and chromadb
                try {
                    const mlRes = await axios.post<MLEncodeResponse>('http://127.0.0.1:5001/encode', {
                        document: {
                            filename: file.originalname,
                            content: content
                        }
                    });

                    const chunks = mlRes.data.chunks;

                    const newDoc = new Document({
                        hash,
                        filename: file.originalname,
                        fullText: content,
                        chunkCount: chunks.length
                    });
                    await newDoc.save();

                    if (chunks.length > 0) {
                        await chromadb.add({
                            ids: chunks.map(c => `${hash}_${c.chunk_index}`),
                            embeddings: chunks.map(c => c.vector),
                            metadatas: chunks.map(c => ({
                                file_hash: hash,
                                chunk_index: c.chunk_index,
                                text_snippet: c.text,
                                start_char: c.start_char,
                                end_char: c.end_char
                            }))
                        });
                    }
                } catch (mlError) {
                    console.error(`ML Service Failed for ${file.originalname}:`, mlError);
                    continue;
                }
            }

            newProcessedFiles.push({ hash, filename: file.originalname });
        }

        if (newProcessedFiles.length > 0) {
            group.files.push(...newProcessedFiles);
            await group.save();
            // new pairs, new file vs any old file, hits the cache miss
            // and will be computed and cached on the next getGroupResults call
        }

        res.json(group);

    } catch (error) {
        console.error('Add Files Error:', error);
        res.status(500).json({ message: 'Error adding files to group' });
    }
};

// file content
export const getFileContent = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { filename } = req.query;

        if (!filename) {
            res.status(400).json({ message: 'Filename is required' });
            return;
        }

        const group = await Group.findById(id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }

        const fileRef = group.files.find(f => f.filename === filename);
        if (!fileRef) {
            res.status(404).json({ message: 'File not found in group' });
            return;
        }

        const doc = await Document.findOne({ hash: fileRef.hash });
        if (!doc) {
            res.status(404).json({ message: 'Document content not found' });
            return;
        }

        res.json({ content: doc.fullText });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching file content', error: error });
    }
};

// file A is compared with file B and result is stored in redis as independent pair (A,B)
// allows cross-group reuse
export const getGroupResults = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const group = await Group.findById(id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }

        const uniqueHashes = [...new Set(group.files.map(f => f.hash))];

        if (uniqueHashes.length < 2) {
            res.json([]);
            return;
        }

        // hash <-> filename
        const hashToFilename: Record<string, string> = {};
        const filenameToHash: Record<string, string> = {};
        group.files.forEach(f => {
            hashToFilename[f.hash] = f.filename;
            filenameToHash[f.filename] = f.hash;
        });

        // pair generation
        const allPairs = generateAllPairs(uniqueHashes);
        const cacheKeys = allPairs.map(([a, b]) => pairCacheKey(a, b));

        // one redis network round trip for all pairs
        // mget returns an array in the same order as the keys
        // null = cache miss, string = cache hit
        const cachedValues = await redisClient.mget(...cacheKeys); // output - ["result1", null, "result3", ...]

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
            console.log(`[Redis] Full cache hit, all ${allPairs.length} pairs served for group ${id}`);
            res.json(finalResults);
            return;
        }

        const hitCount = cachedValues.filter((v: string | null) => v !== null).length;
        console.log(`[Redis] Partial cache hit — ${hitCount}/${allPairs.length} pairs cached. Running ML for ${missingPairsToCompute.length} missing pairs...`);

        // extract just the files needed so Chroma only fetches relevant vectors
        const missingHashArray = [...missingPairHashes];
        const fileNames: Record<string, string> = {};
        missingHashArray.forEach(h => {
            fileNames[h] = hashToFilename[h] ?? h;
        });

        try {
            const mlUrl = process.env.ML_SERVICE_URL || 'http://ml-service:5001';
            const mlResponse = await axios.post(`${mlUrl}/compare-group`, {
                hashes: missingHashArray, // for fetching vectors from chromadb
                filenames: fileNames,
                pairs: missingPairsToCompute // the pairs to be calculated when cache miss
            });

            // ml-service returns results with file1/file2 as filenames
            // reverse map back to hashes to build the pair cache key
            type MLResult = { file1: string; file2: string; score: number; regions: unknown[] };
            const newResults: MLResult[] = mlResponse.data.results;
            console.log(`[ML] Returned ${newResults.length} new pair results`);


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
                    return redisClient.setex(key, PAIR_CACHE_TTL, JSON.stringify(result));
                })
            );

            console.log(`[Redis] Stored ${newResults.length} pair results (TTL: 7 days)`);
            res.json(finalResults);

        } catch (mlError) {
            console.error('ml-service comparison failed:', mlError);
            res.status(502).json({ message: 'Failed to communicate with compare-group service' });
        }

    } catch (error) {
        console.error('Comparison Error:', error);
        res.status(500).json({ message: 'Error calculating comparison' });
    }
};
