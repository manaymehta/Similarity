import { type Request, type Response } from 'express';
import Group from '../models/Group.js';
import Document from '../models/Document.js';
import { computeHash } from '../utils/hash.js';
import { getChromaCollection } from '../utils/chromaClient.js';
import axios from 'axios';

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
                    // Call ML Service
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
        res.status(500).json({ message: 'Server Error creating group' });
    }
};

export const getGroups = async (req: Request, res: Response) => {
    try {
        const groups = await Group.find().sort({ createdAt: -1 });
        res.json(groups);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching groups' });
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
        res.status(500).json({ message: 'Error fetching group' });
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

        // Delete the Group
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
        }

        res.json(group);

    } catch (error) {
        console.error('Add Files Error:', error);
        res.status(500).json({ message: 'Error adding files to group' });
    }
};

// File Content 

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
        res.status(500).json({ message: 'Error fetching file content' });
    }
};

// Comparison Logic
export const getGroupResults = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const group = await Group.findById(id);
        if (!group) {
            res.status(404).json({ message: 'Group not found' });
            return;
        }

        const hashes = group.files.map(f => f.hash);
        // Deduplicate hashes
        const uniqueHashes = [...new Set(hashes)];

        if (uniqueHashes.length === 0) {
            res.json([]);
            return;
        }

        // Map hash to filename for reporting
        const filenames: Record<string, string> = {};
        group.files.forEach(f => {
            filenames[f.hash] = f.filename;
        });

        // calling ml-service for comparison
        try {
            console.log(`Sending ${uniqueHashes.length} file hashes to ml-service for group comparison ${id}...`);
            const mlResponse = await axios.post('http://127.0.0.1:5001/compare-group', {
                hashes: uniqueHashes,
                filenames: filenames
            });
            console.log(`ml-service returned ${mlResponse.data.results.length} results.`);

            res.json(mlResponse.data.results);
        } catch (mlError) {
            console.error("ml-service comparison failed:", mlError);
            res.status(502).json({ message: 'Failed to communicate with compare-group service' });
        }

    } catch (error) {
        console.error("Comparison Error:", error);
        res.status(500).json({ message: 'Error calculating comparison' });
    }
};
