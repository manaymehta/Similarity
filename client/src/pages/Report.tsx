import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useScanStatus } from '../hooks/useScanStatus';
import { getScanResults, type ComparisonResult } from '../services/api';
import { Loader2, AlertCircle, CheckCircle2, FileText, ArrowLeft } from 'lucide-react';
import { Heatmap } from '../components/visualization/Heatmap';
import { SideBySideViewer } from '../components/visualization/SideBySideViewer';

export const Report: React.FC = () => {
    const { scanId } = useParams();
    const navigate = useNavigate();
    const { status, loading: statusLoading, error: statusError } = useScanStatus(scanId);
    const [results, setResults] = useState<ComparisonResult[]>([]);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [selectedComparison, setSelectedComparison] = useState<ComparisonResult | null>(null);

    useEffect(() => {
        if (status?.status === 'completed') {
            setResultsLoading(true);
            getScanResults(scanId!)
                .then(setResults)
                .catch((err) => console.error("Failed to fetch results", err))
                .finally(() => setResultsLoading(false));
        }
    }, [status, scanId]);

    if (statusLoading || (status?.status === 'completed' && resultsLoading)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                <p className="text-slate-400 text-lg animate-pulse">
                    {status?.status === 'processing' ? 'Analyzing documents...' : 'Loading report...'}
                </p>
            </div>
        );
    }

    if (statusError || status?.status === 'failed') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <AlertCircle className="w-16 h-16 text-red-500" />
                <h2 className="text-2xl font-bold text-slate-200">Analysis Failed</h2>
                <p className="text-slate-400">Something went wrong during the scan.</p>
                <button
                    onClick={() => navigate('/')}
                    className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
                >
                    Go Home
                </button>
            </div>
        );
    }

    const filenames = status?.files.map(f => f.filename) || [];

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-slate-400 hover:text-white mb-2 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Upload
                    </button>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        Analysis Report
                        <span className="text-sm font-normal px-3 py-1 bg-green-500/10 text-green-400 rounded-full border border-green-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                        </span>
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Scan ID: <span className="font-mono text-slate-500">{scanId}</span>
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Files Analyzed" value={status?.files.length || 0} icon={FileText} />
                <StatCard label="Total Comparisons" value={results.length} icon={Loader2} />
                <StatCard
                    label="Avg Similarity"
                    value={`${results.length ? (results.reduce((acc, curr) => acc + curr.score, 0) / results.length * 100).toFixed(1) : '0.0'}%`}
                    icon={CheckCircle2}
                />
            </div>

            {/* Visualizations */}
            <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden p-6">
                    <h2 className="text-lg font-semibold text-slate-200 mb-4">Similarity Matrix</h2>
                    <Heatmap
                        results={results}
                        filenames={filenames}
                        onCellClick={setSelectedComparison}
                    />
                </div>
            </div>

            {/* Modal */}
            {selectedComparison && status && (
                <SideBySideViewer
                    result={selectedComparison}
                    files={status.files}
                    onClose={() => setSelectedComparison(null)}
                />
            )}
        </div>
    );
};

const StatCard = ({ label, value, icon: Icon }: any) => (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
        <div>
            <p className="text-slate-400 text-sm font-medium">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-lg">
            <Icon className="w-6 h-6 text-blue-400" />
        </div>
    </div>
);
