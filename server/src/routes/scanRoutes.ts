import { Router } from 'express';
import multer from 'multer';
import { uploadFiles } from '../controllers/scanController.js';

const router = Router();

// Store files in memory so we can read the text content
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limit to 5MB
});
// POST /api/scan/upload
router.post('/upload', upload.array('documents', 50), uploadFiles);

export default router;
