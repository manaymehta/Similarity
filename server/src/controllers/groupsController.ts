import { type Request, type Response } from 'express';
import Group from '../models/Group.js';
import Document from '../models/Document.js';
import { computeHash } from '../utils/hash.js';
import { getChromaCollection } from '../utils/chromaClient.js';
import axios from 'axios';

// --- Types ---
interface MLChunk {
    vector: number[];
    text: string;
    chunk_index: number;
    start_char: number;
    end_char: number;
}

interface MLEncodeResponse {
    chunks: MLChunk[];
}

// --- Controller ---

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

        // 1. Process each file
        for (const file of files) {
            const content = file.buffer.toString('utf-8');
            const hash = computeHash(content);

            // 2. Check Cache (MongoDB)
            const existingDoc = await Document.findOne({ hash });

            if (!existingDoc) {
                // 3. Cache Miss: Encode and Save
                try {
                    // Call ML Service
                    const mlRes = await axios.post<MLEncodeResponse>('http://127.0.0.1:5001/encode', {
                        document: {
                            filename: file.originalname,
                            content: content
                        }
                    });

                    const chunks = mlRes.data.chunks;

                    // Save to MongoDB (Source of Truth)
                    const newDoc = new Document({
                        hash,
                        filename: file.originalname,
                        fullText: content,
                        chunkCount: chunks.length
                    });
                    await newDoc.save();

                    // Save to ChromaDB (Vector Index)
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
                    console.log(`[Cache Miss] Encoded and saved ${file.originalname} (${hash})`);

                } catch (mlError) {
                    console.error(`ML Service Failed for ${file.originalname}:`, mlError);
                    // Skip this file or throw? Let's skip for robustness
                    continue;
                }
            } else {
                console.log(`[Cache Hit] Using existing ${file.originalname} (${hash})`);
            }

            processedFiles.push({ hash, filename: file.originalname });
        }

        // 4. Create Group
        const group = await Group.create({
            name: groupName || `Group - ${new Date().toLocaleDateString()}`,
            files: processedFiles,
            status: 'completed' // In this hybrid model, "processing" is synchronous per-file above
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

// --- File Content Helper ---

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

// --- Comparison Logic (All-vs-All) ---



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

        // Call Python ML Service for centralized comparison
        try {
            const mlResponse = await axios.post('http://127.0.0.1:5001/compare-group', {
                hashes: uniqueHashes,
                filenames: filenames
            });

            res.json(mlResponse.data.results);
        } catch (mlError) {
            console.error("ML Service Comparison Failed:", mlError);
            res.status(502).json({ message: 'Failed to communicate with comparison service' });
        }

    } catch (error) {
        console.error("Comparison Error:", error);
        res.status(500).json({ message: 'Error calculating comparison' });
    }
};
