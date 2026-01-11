import express from 'express';
import multer from 'multer';
import { createGroup, getGroups, getGroupDetails, getGroupResults, getFileContent } from '../controllers/groupsController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/groups - Create a new group with files
router.post('/', upload.array('files'), createGroup);

// GET /api/groups - List all groups
router.get('/', getGroups);

// GET /api/groups/:id - Get specific group details
router.get('/:id', getGroupDetails);

// GET /api/groups/:id/files/content - Get content of a specific file
router.get('/:id/files/content', getFileContent);

// GET /api/groups/:id/results - Get comparison results for the group
router.get('/:id/results', getGroupResults);

export default router;
