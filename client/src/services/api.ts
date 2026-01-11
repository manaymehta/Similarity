import axios from 'axios';

// --- Types (to be moved to shared types later) ---
export interface ScanGroup {
    _id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    files: Array<{ filename: string; content?: string }>;
    createdAt: string;
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

export interface ComparisonResult {
    file1: string;
    file2: string;
    score: number;
    regions: Region[]; // This might need refinement based on exact backend response
}

// --- API Client ---
const apiClient = axios.create({
    baseURL: '/api', // Vite proxy will handle this
    headers: {
        'Content-Type': 'application/json',
    },
});

// --- Service Functions ---

/**
 * Upload files for scanning.
 * @param files FileList or Array of File objects
 */
export const uploadFiles = async (files: File[]): Promise<{ scanId: string }> => {
    const formData = new FormData();
    files.forEach((file) => {
        formData.append('documents', file);
    });

    // Note: Content-Type: multipart/form-data is set automatically by axios when data is FormData
    const response = await apiClient.post<{ scanId: string }>('/scan/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

/**
 * Get the status of a specific scan group.
 */
export const getScanStatus = async (scanId: string): Promise<ScanGroup> => {
    const response = await apiClient.get<ScanGroup>(`/scan/${scanId}/status`);
    return response.data;
};

/**
 * Get the comparison results for a completed scan.
 */
export const getScanResults = async (scanId: string): Promise<ComparisonResult[]> => {
    const response = await apiClient.get<ComparisonResult[]>(`/scan/${scanId}/results`);
    return response.data;
};

export default apiClient;
