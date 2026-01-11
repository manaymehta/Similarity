import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, AlertCircle } from 'lucide-react';
import { FileDropZone, UploadList } from '../components/upload/FileDropZone';
import { createGroup } from '../services/api';
import clsx from 'clsx';

export const Home: React.FC = () => {
    const navigate = useNavigate();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFilesSelected = (files: File[]) => {
        const newFiles = [...selectedFiles, ...files].filter(
            (file, index, self) =>
                index === self.findIndex((f) => f.name === file.name)
        );
        setSelectedFiles(newFiles);
        setError(null);
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (selectedFiles.length < 2) {
            setError("Please select at least 2 files to compare.");
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const group = await createGroup(selectedFiles, groupName);
            // Navigate to report page (using group ID as scan ID)
            navigate(`/report/${group._id}`);
        } catch (err: any) {
            console.error("Upload failed", err);
            setError(
                err.response?.data?.message || "Failed to create group. Please try again."
            );
            setIsUploading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-3xl space-y-8">
                {/* Header */}
                <div className="text-center space-y-4 relative">
                    <button
                        onClick={() => navigate('/groups')}
                        className="absolute right-0 top-0 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                    >
                        View Past Scans &rarr;
                    </button>
                    <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent pb-1">
                        Similarity Detector
                    </h1>
                    <p className="text-lg text-slate-400 max-w-xl mx-auto">
                        Upload documents to detect semantic similarities, paraphrasing, and common patterns using advanced AI.
                    </p>
                </div>

                {/* Main Card */}
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl shadow-blue-900/10 backdrop-blur-sm">

                    {/* Group Name Input */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Group Name (Optional)</label>
                        <input
                            type="text"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder="e.g. 'History Assignment 1'"
                            className="w-full bg-slate-800 border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>

                    <FileDropZone
                        onFilesSelected={handleFilesSelected}
                        disabled={isUploading}
                    />

                    <UploadList files={selectedFiles} onRemove={handleRemoveFile} />

                    {/* Actions */}
                    <div className="mt-8 flex flex-col items-center gap-4">
                        {error && (
                            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-4 py-2 rounded-lg text-sm">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleUpload}
                            disabled={isUploading || selectedFiles.length < 2}
                            className={clsx(
                                "group relative w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-2",
                                isUploading || selectedFiles.length < 2
                                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                    : "bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] shadow-lg shadow-blue-600/20"
                            )}
                        >
                            {isUploading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <>
                                    <UploadCloud className="w-5 h-5 group-hover:animate-bounce" />
                                    <span>Create Group & Analyze</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center pt-8">
                    <FeatureItem
                        title="Smart Analysis"
                        desc="Detects paraphrasing, not just exact matches."
                    />
                    <FeatureItem
                        title="Batch Processing"
                        desc="Compare dozens of files simultaneously."
                    />
                    <FeatureItem
                        title="Visual Reports"
                        desc="Interactive heatmaps and side-by-side view."
                    />
                </div>
            </div>
        </div>
    );
};

const FeatureItem = ({ title, desc }: { title: string; desc: string }) => (
    <div className="space-y-1">
        <h3 className="text-slate-200 font-semibold">{title}</h3>
        <p className="text-sm text-slate-500">{desc}</p>
    </div>
);
