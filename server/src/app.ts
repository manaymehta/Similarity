import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import groupsRoutes from './routes/groupsRoutes.js';
import systemRoutes from './routes/systemRoutes.js';
import jobsRoutes from './routes/jobsRoutes.js';
import './workers/comparisonWorker.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/groups', groupsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/jobs', jobsRoutes);

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

export default app;
