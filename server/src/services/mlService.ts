import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

interface Document {
    filename: string;
    content: string;
}

export interface Region {
    a_start: number;
    a_end: number;
    b_start: number;
    b_end: number;
    score: number;
    text_a: string;
    text_b: string;
}

export interface SimilarityResponse {
    score: number;
    regions: Region[];
}

export const checkSimilarity = async (docA: Document, docB: Document): Promise<SimilarityResponse> => {
    try {
        const response = await axios.post<SimilarityResponse>(`${ML_SERVICE_URL}/compare`, { doc_a: docA, doc_b: docB });
        return response.data;
    } catch (error) {
        console.error('ML Service Error:', error);
        throw new Error('Failed to compute similarity');
    }
};

export interface BatchComparisonResult {
    file1: string;
    file2: string;
    score: number;
    regions: Region[];
}

export const checkBatchSimilarity = async (documents: Document[]): Promise<BatchComparisonResult[]> => {
    try {
        const response = await axios.post<{ results: BatchComparisonResult[] }>(`${ML_SERVICE_URL}/batch-compare`, {
            documents
        });
        return response.data.results;
    } catch (error) {
        console.error('ML Batch Service Error:', error);
        throw new Error('Failed to compute batch similarity');
    }
};

