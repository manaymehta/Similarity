import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGroupDetails, startComparison, getJobStatus, getFileContent, addFilesToGroup, crossGroupSearch, type ComparisonResult, type CrossSearchResult, type Group } from '../services/api';
import { Loader2, AlertCircle, CheckCircle2, FileText, ArrowLeft, Plus, Search, Globe } from 'lucide-react';
import { Heatmap } from '../components/visualization/Heatmap';
import { SideBySideViewer } from '../components/visualization/SideBySideViewer';

export const Report: React.FC = () => {
    const { scanId } = useParams(); // scanId is actually groupId
    const navigate = useNavigate();

    const [group, setGroup] = useState<Group | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusError, setStatusError] = useState<string | null>(null);

    const [results, setResults] = useState<ComparisonResult[]>([]);
    const [resultsLoading, setResultsLoading] = useState(false);
    
    // Polling states
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobProgress, setJobProgress] = useState<number | object>(0);
    const [jobState, setJobState] = useState<string>('waiting');

    const [searchMode, setSearchMode] = useState<'group' | 'global'>('group');
    const [selectedComparison, setSelectedComparison] = useState<ComparisonResult | null>(null);
    const [fileContent1, setFileContent1] = useState<string>("");
    const [fileContent2, setFileContent2] = useState<string>("");
    const [contentLoading, setContentLoading] = useState(false);
    const [addingFiles, setAddingFiles] = useState(false);

    const loadData = React.useCallback(async () => {
        if (!scanId) return;
        try {
            const groupData = await getGroupDetails(scanId);
            setGroup(groupData);

            if (groupData._id) {
                setResultsLoading(true);
                const { jobId: newJobId } = await startComparison(scanId);
                setJobId(newJobId);
            }
        } catch (err) {
            console.error("Failed to load report", err);
            setStatusError("Failed to load group details.");
            setResultsLoading(false);
        } finally {
            setStatusLoading(false);
        }
    }, [scanId]);

    // Polling effect
    useEffect(() => {
        if (!jobId) return;

        const intervalId = setInterval(async () => {
            try {
                const status = await getJobStatus(jobId);
                setJobState(status.state);
                setJobProgress(status.progress);

                if (status.state === 'completed' && status.result) {
                    setResults(status.result);
                    setResultsLoading(false);
                    setJobId(null);
                    clearInterval(intervalId);
                } else if (status.state === 'failed') {
                    console.error("Job failed", status.failedReason);
                    setStatusError("Comparison failed.");
                    setResultsLoading(false);
                    setJobId(null);
                    clearInterval(intervalId);
                }
            } catch (err) {
                console.error("Failed to poll status", err);
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [jobId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAddFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files?.length || !scanId) return;

        setAddingFiles(true);
        const filesArray = Array.from(event.target.files);

        try {
            await addFilesToGroup(scanId, filesArray);
            await loadData(); // Reload everything
        } catch (error) {
            console.error('Failed to add files', error);
            alert('Failed to add files');
        } finally {
            setAddingFiles(false);
            // innovative way to clear input
            event.target.value = '';
        }
    };

    const handleComparisionSelect = async (comparison: ComparisonResult) => {
        setContentLoading(true);
        try {
            const [c1, c2] = await Promise.all([
                getFileContent(scanId!, comparison.file1),
                getFileContent(scanId!, comparison.file2)
            ]);
            setFileContent1(c1);
            setFileContent2(c2);
            setSelectedComparison(comparison);
        } catch (error) {
            console.error("Failed to load file contents", error);
        } finally {
            setContentLoading(false);
        }
    };

    if (statusLoading || resultsLoading) {
        let loadingText = 'Loading report...';
        if (jobState === 'active') {
            const step = typeof jobProgress === 'object' ? (jobProgress as any).step : 'Running...';
            const pct = typeof jobProgress === 'object' ? (jobProgress as any).percent : jobProgress;
            loadingText = `Analyzing Documents: ${step} (${pct}%)`;
        } else if (jobState === 'waiting') {
            loadingText = 'Queued for analysis...';
        }

        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                <p className="text-slate-400 text-lg animate-pulse">
                    {loadingText}
                </p>
            </div>
        );
    }

    if (statusError || !group) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <AlertCircle className="w-16 h-16 text-red-500" />
                <h2 className="text-2xl font-bold text-slate-200">Analysis Failed</h2>
                <p className="text-slate-400">{statusError || "Group not found."}</p>
                <button
                    onClick={() => navigate('/')}
                    className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
                >
                    Go Home
                </button>
            </div>
        );
    }

    const filenames = group.files.map(f => f.filename);

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
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            {group.name}
                            <span className="text-sm font-normal px-3 py-1 bg-green-500/10 text-green-400 rounded-full border border-green-500/20 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {group.status}
                            </span>
                        </h1>
                    </div>
                    <p className="text-slate-400 mt-1">
                        Group ID: <span className="font-mono text-slate-500">{scanId}</span>
                    </p>
                </div>

                <div className="flex gap-2">
                    <label className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all ${addingFiles ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {addingFiles ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Plus className="w-4 h-4" />
                        )}
                        <span>{addingFiles ? 'Adding...' : 'Add Files'}</span>
                        <input
                            type="file"
                            multiple
                            onChange={handleAddFiles}
                            disabled={addingFiles}
                            className="hidden"
                            accept=".txt,.md,.pdf,.docx"
                        />
                    </label>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Files Analyzed" value={group.files.length} icon={FileText} />
                <StatCard label="Total Comparisons" value={results.length} icon={Loader2} />
                <StatCard
                    label="Avg Similarity"
                    value={`${results.length ? (results.reduce((acc, curr) => acc + curr.score, 0) / results.length * 100).toFixed(1) : '0.0'}%`}
                    icon={CheckCircle2}
                />
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-2 border-b border-slate-800 pb-0">
                <button
                    onClick={() => setSearchMode('group')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${searchMode === 'group' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    <FileText className="w-4 h-4" /> Group Analysis
                </button>
                <button
                    onClick={() => setSearchMode('global')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${searchMode === 'global' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    <Globe className="w-4 h-4" /> Global Search
                </button>
            </div>

            {/* Visualizations */}
            {searchMode === 'group' ? (
                <div className="space-y-6">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden p-6 relative">
                        {contentLoading && (
                            <div className="absolute inset-0 z-10 bg-black/50 backdrop-blur-[1px] flex items-center justify-center">
                                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            </div>
                        )}
                        <h2 className="text-lg font-semibold text-slate-200 mb-4">Similarity Matrix</h2>
                        <Heatmap
                            results={results}
                            filenames={filenames}
                            onCellClick={handleComparisionSelect}
                        />
                    </div>
                </div>
            ) : (
                <GlobalSearchPanel group={group} scanId={scanId!} />
            )}

            {/* Modal */}
            {selectedComparison && (
                <SideBySideViewer
                    result={selectedComparison}
                    file1Content={fileContent1}
                    file2Content={fileContent2}
                    onClose={() => setSelectedComparison(null)}
                />
            )}
        </div>
    );
};

const GlobalSearchPanel: React.FC<{ group: Group; scanId: string }> = ({ group, scanId }) => {
    const navigate = useNavigate();
    const [selectedHash, setSelectedHash] = useState<string | null>(null);
    const [results, setResults] = useState<CrossSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (hash: string) => {
        setSelectedHash(hash);
        setLoading(true);
        setError(null);
        try {
            const data = await crossGroupSearch(scanId, hash);
            setResults(data);
        } catch {
            setError('Search failed. Make sure other groups have been analyzed.');
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* File list */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-3">
                <h2 className="text-lg font-semibold text-slate-200 mb-2">Select a file to search globally</h2>
                {group.files.map(f => (
                    <button
                        key={f.hash}
                        onClick={() => handleSearch(f.hash)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors text-left ${selectedHash === f.hash ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:text-white'}`}
                    >
                        <span className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="truncate text-sm">{f.filename}</span>
                        </span>
                        <Search className="w-4 h-4 shrink-0 ml-2 text-slate-400" />
                    </button>
                ))}
            </div>

            {/* Results panel */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-slate-200 mb-4">Similar files in other groups</h2>
                {!selectedHash && (
                    <p className="text-slate-500 text-sm">Select a file on the left to find similar documents across all groups.</p>
                )}
                {loading && (
                    <div className="flex items-center gap-3 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Searching...</span>
                    </div>
                )}
                {error && <p className="text-red-400 text-sm">{error}</p>}
                {!loading && results.length === 0 && selectedHash && !error && (
                    <p className="text-slate-500 text-sm">No similar files found in other groups.</p>
                )}
                <div className="space-y-3">
                    {results.map(r => (
                        <div key={r.hash} className="flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">{r.filename}</p>
                                <p className="text-xs text-slate-400 mt-0.5 truncate">
                                    Group: <button onClick={() => navigate(`/report/${r.groupId}`)} className="text-blue-400 hover:underline">{r.groupName}</button>
                                </p>
                            </div>
                            <span className={`ml-4 shrink-0 px-3 py-1 rounded-full text-xs font-bold ${r.score >= 0.75 ? 'bg-red-500/15 text-red-400' : r.score >= 0.55 ? 'bg-orange-500/15 text-orange-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                                {(r.score * 100).toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

interface StatCardProps {
    label: string;
    value: string | number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: React.FC<any>;
}

const StatCard = ({ label, value, icon: Icon }: StatCardProps) => (
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
