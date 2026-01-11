import { useState, useEffect, useRef } from 'react';
import { getScanStatus, type ScanGroup } from '../services/api';

export const useScanStatus = (scanId: string | undefined) => {
    const [status, setStatus] = useState<ScanGroup | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!scanId) return;

        const fetchStatus = async () => {
            try {
                const data = await getScanStatus(scanId);
                setStatus(data);

                if (data.status === 'completed' || data.status === 'failed') {
                    setLoading(false);
                    if (pollInterval.current) clearInterval(pollInterval.current);
                }
            } catch (err) {
                console.error("Poll error", err);
                setError("Failed to fetch scan status");
                setLoading(false);
                if (pollInterval.current) clearInterval(pollInterval.current);
            }
        };

        // Initial fetch
        fetchStatus();

        // Start polling
        pollInterval.current = setInterval(fetchStatus, 2000);

        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current);
        };
    }, [scanId]);

    return { status, loading, error };
};
