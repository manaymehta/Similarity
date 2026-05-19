import { type Request, type Response } from 'express';
import Group from '../models/Group.js';
import Document from '../models/Document.js';
import { computeHash } from '../utils/hash.js';
import { getChromaCollection } from '../utils/chromaClient.js';
import { extractText } from '../utils/fileParser.js';
import axios from 'axios';
import redisClient from '../config/redis.js';
import { comparisonQueue } from '../queues/comparisonQueue.js';

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
            const content = await extractText(file.buffer, file.originalname);
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
            const content = await extractText(file.buffer, file.originalname);
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

export const crossGroupSearch = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { fileHash } = req.query;

        if (!fileHash || typeof fileHash !== 'string') {
            res.status(400).json({ message: 'fileHash query param is required' });
            return;
        }

        const group = await Group.findById(id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }

        const excludeHashes = group.files.map(f => f.hash);
        const mlUrl = process.env.ML_SERVICE_URL || 'http://ml-service:5001';

        const mlRes = await axios.post<{ results: { hash: string; score: number }[] }>(
            `${mlUrl}/cross-search`,
            { query_hash: fileHash, exclude_hashes: excludeHashes, n_results: 5 }
        );

        const enriched = await Promise.all(
            mlRes.data.results.map(async ({ hash, score }) => {
                const doc = await Document.findOne({ hash });
                const ownerGroup = await Group.findOne({ 'files.hash': hash });
                return {
                    hash,
                    score,
                    filename: doc?.filename ?? 'Unknown',
                    groupName: ownerGroup?.name ?? 'Unknown',
                    groupId: ownerGroup?._id?.toString() ?? '',
                };
            })
        );

        res.json(enriched);
    } catch (error) {
        console.error('Cross-search Error:', error);
        res.status(500).json({ message: 'Error performing cross-group search' });
    }
};

export const getGroupResults = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const group = await Group.findById(id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }

        // Add a job to the comparison queue
        const job = await comparisonQueue.add('compare-group', { groupId: id }, {
            jobId: `group-compare-${id}`, // Idempotent job ID based on group ID
            removeOnComplete: { age: 3600 }, // Keep completed jobs in Redis for 1 hour
            removeOnFail: { age: 3600 }
        });

        res.json({ 
            jobId: job.id, 
            message: 'Comparison job enqueued' 
        });

    } catch (error) {
        console.error('Enqueue Error:', error);
        res.status(500).json({ message: 'Error enqueuing comparison job' });
    }
};
