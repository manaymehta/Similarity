import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGroupDetails, getGroupResults, getFileContent, type ComparisonResult, type Group } from '../services/api';
import { Loader2, AlertCircle, CheckCircle2, FileText, ArrowLeft } from 'lucide-react';
import { Heatmap } from '../components/visualization/Heatmap';
import { SideBySideViewer } from '../components/visualization/SideBySideViewer';

export const Report: React.FC = () => {
    const { scanId } = useParams(); // scanId is actually groupId
    const navigate = useNavigate();

    const [group, setGroup] = useState<Group | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusError, setStatusError] = useState<string | null>(null); // Keeping string for error message

    const [results, setResults] = useState<ComparisonResult[]>([]);
    const [resultsLoading, setResultsLoading] = useState(false);

    const [selectedComparison, setSelectedComparison] = useState<ComparisonResult | null>(null);
    const [fileContent1, setFileContent1] = useState<string>("");
    const [fileContent2, setFileContent2] = useState<string>("");
    const [contentLoading, setContentLoading] = useState(false);

    useEffect(() => {
        if (!scanId) return;

        const fetchData = async () => {
            try {
                // 1. Fetch Group Details
                const groupData = await getGroupDetails(scanId);
                setGroup(groupData);

                // 2. Fetch Results (assuming completed, since flow is sync)
                if (groupData._id) {
                    setResultsLoading(true);
                    const resultsData = await getGroupResults(scanId);
                    setResults(resultsData);
                }
            } catch (err: any) {
                console.error("Failed to load report", err);
                setStatusError("Failed to load group details.");
            } finally {
                setStatusLoading(false);
                setResultsLoading(false);
            }
        };

        fetchData();
    }, [scanId]);

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
            // Optionally show toast error
        } finally {
            setContentLoading(false);
        }
    };

    if (statusLoading || resultsLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                <p className="text-slate-400 text-lg animate-pulse">
                    Loading report...
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
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        {group.name}
                        <span className="text-sm font-normal px-3 py-1 bg-green-500/10 text-green-400 rounded-full border border-green-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {group.status}
                        </span>
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Group ID: <span className="font-mono text-slate-500">{scanId}</span>
                    </p>
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

            {/* Visualizations */}
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
