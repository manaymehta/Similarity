import axios from 'axios';

// --- Types (to be moved to shared types later) ---
export interface Group {
    _id: string;
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    files: Array<{ filename: string; hash: string }>;
    createdAt: string;
}

export interface SystemMetrics {
    mongodb: { groups: number; documents: number };
    chromadb: { chunks: number };
    redis: { totalPairsCached: number; pairs: Array<{ key: string; file1: string; file2: string; ttl: number }> };
}

export interface Region {
    a_start: number;
    a_end: number;
    b_start: number;
    b_end: number;
    score: number;
    text_a: string;
    text_b: string;
    a_start_char: number;
    a_end_char: number;
    b_start_char: number;
    b_end_char: number;
}

export interface ComparisonResult {
    file1: string;
    file2: string;
    score: number;
    regions: Region[];
}

// --- API Client ---
const apiClient = axios.create({
    // Direct link to the backend container (exposed on host port 5000)
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// --- Service Functions ---

/**
 * Create a new group with files.
 */
export const createGroup = async (files: File[], groupName?: string): Promise<Group> => {
    const formData = new FormData();
    if (groupName) formData.append('groupName', groupName);
    files.forEach((file) => {
        formData.append('files', file);
    });

    const response = await apiClient.post<Group>('/groups', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

/**
 * Get all groups.
 */
export const getGroups = async (): Promise<Group[]> => {
    const response = await apiClient.get<Group[]>('/groups');
    return response.data;
};

/**
 * Get details of a specific group.
 */
export const getGroupDetails = async (groupId: string): Promise<Group> => {
    const response = await apiClient.get<Group>(`/groups/${groupId}`);
    return response.data;
};

/**
 * Get the results for a group.
 */
export const getGroupResults = async (groupId: string): Promise<ComparisonResult[]> => {
    const response = await apiClient.get<ComparisonResult[]>(`/groups/${groupId}/results`);
    return response.data;
};

/**
 * Get content of a specific file in a group.
 */
export const getFileContent = async (groupId: string, filename: string): Promise<string> => {
    const response = await apiClient.get<{ content: string }>(`/groups/${groupId}/files/content`, {
        params: { filename }
    });
    return response.data.content;
};


/**
 * Delete a group.
 */
export const deleteGroup = async (groupId: string): Promise<void> => {
    await apiClient.delete(`/groups/${groupId}`);
};

/**
 * Add files to an existing group.
 */
export const addFilesToGroup = async (groupId: string, files: File[]): Promise<Group> => {
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });

    const response = await apiClient.post<Group>(`/groups/${groupId}/files`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

/**
 * Get system metrics for databases.
 */
export const getSystemMetrics = async (): Promise<SystemMetrics> => {
    const response = await apiClient.get<SystemMetrics>('/system/stats');
    return response.data;
};

export default apiClient;
