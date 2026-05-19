import express from 'express';
import multer from 'multer';
import { createGroup, getGroups, getGroupDetails, getGroupResults, getFileContent, deleteGroup, addFilesToGroup, crossGroupSearch } from '../controllers/groupsController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// create a new group with files
router.post('/', upload.array('files'), createGroup);

// list all groups
router.get('/', getGroups);

// get specific group details
router.get('/:id', getGroupDetails);

// get content of a specific file
router.get('/:id/files/content', getFileContent);

// get comparison results for the group
router.get('/:id/results', getGroupResults);

// delete group
router.delete('/:id', deleteGroup);

// cross-group ANN search for a specific file
router.get('/:id/cross-search', crossGroupSearch);

// add files to group
router.post('/:id/files', upload.array('files'), addFilesToGroup);

export default router;
