import { type Request, type Response } from 'express';
import ScanGroup from '../models/ScanGroup.js';
import ComparisonResult from '../models/ComparisonResult.js';
import { checkBatchSimilarity } from '../services/mlService.js';

// Background processing function 
const processScanGroup = async (scanGroupId: string) => {
    try {
        const scanGroup = await ScanGroup.findById(scanGroupId);
        if (!scanGroup) return;

        scanGroup.status = 'processing';
        await scanGroup.save();

        const files = scanGroup.files;

        if (files.length < 2) {
            scanGroup.status = 'completed';
            await scanGroup.save();
            return;
        }

        try {
            const documents = files.map(f => ({
                filename: f.filename,
                content: f.content
            }));

            const keyResults = await checkBatchSimilarity(documents);

            const comparisonDocs = keyResults.map(res => ({
                scanGroupId: scanGroup._id,
                file1: res.file1,
                file2: res.file2,
                score: res.score,
                regions: res.regions
            }));

            if (comparisonDocs.length > 0) {
                await ComparisonResult.insertMany(comparisonDocs);
            }

            scanGroup.status = 'completed';
            await scanGroup.save();
            console.log(`Scan group ${scanGroupId} processing complete (Batch Mode).`);

        } catch (err) {
            console.error(`Batch processing failed for group ${scanGroupId}`, err);
            scanGroup.status = 'failed';
            await scanGroup.save();
        }

    } catch (error) {
        console.error(`Error processing scan group ${scanGroupId}:`, error);
        await ScanGroup.findByIdAndUpdate(scanGroupId, { status: 'failed' });
    }
};

export const uploadFiles = async (req: Request, res: Response) => {
    try {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length < 2) {
            res.status(400).json({ message: 'Please upload at least 2 files' });
            return;
        }

        const fileDocuments = files.map(file => ({
            filename: file.originalname,
            content: file.buffer.toString('utf-8')
        }));

        const scanGroup = await ScanGroup.create({
            files: fileDocuments,
            status: 'pending'
        });

        // Start processing in background
        processScanGroup((scanGroup._id as unknown as string));

        res.status(201).json({
            message: 'Files uploaded successfully',
            scanId: scanGroup._id,
            fileCount: files.length,
            status: 'pending'
        });

    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Server Error during upload' });
    }
};

export const getScanStatus = async (req: Request, res: Response) => {
    try {
        const { scanId } = req.params;
        const scanGroup = await ScanGroup.findById(scanId);

        if (!scanGroup) {
            res.status(404).json({ message: 'Scan not found' });
            return;
        }

        res.json({
            _id: scanGroup._id,
            status: scanGroup.status,
            files: scanGroup.files,
            createdAt: scanGroup.createdAt
        });
    } catch (error) {
        console.error('Get Status Error:', error);
        res.status(500).json({ message: 'Server Error fetching status' });
    }
};

export const getScanResults = async (req: Request, res: Response) => {
    try {
        const { scanId } = req.params;

        if (!scanId) {
            res.status(400).json({ message: 'Scan ID is required' });
            return;
        }

        const results = await ComparisonResult.find({ scanGroupId: scanId });

        // If scan is completed but no results found, return empty array
        // (This happens if < 2 files or some error)
        res.json(results);
    } catch (error) {
        console.error('Get Results Error:', error);
        res.status(500).json({ message: 'Server Error fetching results' });
    }
};
