import { Router } from 'express';
import multer from 'multer';
import { uploadFiles, getScanStatus, getScanResults } from '../controllers/scanController.js';

const router = Router();
console.log('Loading scanRoutes...');

// Store files in memory so we can read the text content
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limit to 5MB
});
// POST /api/scan/upload
router.post('/upload', upload.array('documents', 50), uploadFiles);

// GET /api/scan/:scanId/status
router.get('/:scanId/status', getScanStatus);

// GET /api/scan/:scanId/results
router.get('/:scanId/results', getScanResults);

export default router;
