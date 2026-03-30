import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import groupsRoutes from './routes/groupsRoutes.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/groups', groupsRoutes); // what this does is it tells the server that if a request comes with the path /api/groups, it should be handled by the groupsRoutes

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

export default app;
