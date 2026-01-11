import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComparisonResult } from '../../services/api';

interface SideBySideViewerProps {
    result: ComparisonResult;
    file1Content: string;
    file2Content: string;
    onClose: () => void;
}

export const SideBySideViewer: React.FC<SideBySideViewerProps> = ({ result, file1Content, file2Content, onClose }) => {
    const [currentRegionIndex, setCurrentRegionIndex] = useState(0);
    const regions = result.regions || [];
    const hasRegions = regions.length > 0;

    const navigateRegion = (direction: 'next' | 'prev') => {
        if (!hasRegions) return;
        if (direction === 'next') {
            setCurrentRegionIndex((prev) => (prev + 1) % regions.length);
        } else {
            setCurrentRegionIndex((prev) => (prev - 1 + regions.length) % regions.length);
        }
    };

    // Auto-scroll to highlighted region
    const activeRef1 = useRef<HTMLSpanElement>(null);
    const activeRef2 = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (activeRef1.current) activeRef1.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (activeRef2.current) activeRef2.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [currentRegionIndex]);

    const HighlightedText = ({ content, regions, activeIndex, isFile1, activeRef }: {
        content: string,
        regions: any[],
        activeIndex: number,
        isFile1: boolean,
        activeRef: React.RefObject<HTMLSpanElement | null>
    }) => {
        if (!regions || regions.length === 0) {
            return (
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-300 leading-relaxed">
                    {content}
                </pre>
            );
        }

        // Sort regions by start char to handle sequential rendering (assuming no overlap for simplicity or taken care of)
        // For the active region, we definitely highlight. 
        // For context, we might highlight others? For now, let's just highlight the ACTIVELY selected region to avoid clutter.

        const activeRegion = regions[activeIndex];
        if (!activeRegion) return <pre>{content}</pre>;

        const startChar = isFile1 ? activeRegion.a_start_char : activeRegion.b_start_char;
        const endChar = isFile1 ? activeRegion.a_end_char : activeRegion.b_end_char;

        // Safety check
        if (startChar === undefined || endChar === undefined || startChar < 0 || endChar > content.length) {
            return <pre>{content}</pre>;
        }

        const pre = content.substring(0, startChar);
        const match = content.substring(startChar, endChar);
        const post = content.substring(endChar);

        return (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-300 leading-relaxed">
                {pre}
                <span
                    ref={activeRef}
                    className="bg-yellow-500/40 text-yellow-100 rounded px-0.5 border-b border-yellow-500"
                >
                    {match}
                </span>
                {post}
            </pre>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-white">Comparison Detail</h2>
                        <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-mono">
                            {result.file1} vs {result.file2}
                        </span>
                        <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-bold">
                            {(result.score * 100).toFixed(1)}% Match
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {hasRegions && (
                            <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                                <button onClick={() => navigateRegion('prev')} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="text-xs font-mono text-slate-400 w-24 text-center">
                                    Region {currentRegionIndex + 1} of {regions.length}
                                </span>
                                <button onClick={() => navigateRegion('next')} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 grid grid-cols-2 divide-x divide-slate-700 min-h-0">
                    {/* Left Panel */}
                    <div className="flex flex-col min-h-0">
                        <div className="p-3 bg-slate-800/30 border-b border-slate-700 sticky top-0 flex justify-between items-center">
                            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                <ExternalLink className="w-4 h-4" /> {result.file1}
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-900 scrollbar-thin scrollbar-thumb-slate-700">
                            <HighlightedText
                                content={file1Content}
                                regions={regions}
                                activeIndex={currentRegionIndex}
                                isFile1={true}
                                activeRef={activeRef1}
                            />
                        </div>
                    </div>

                    {/* Right Panel */}
                    <div className="flex flex-col min-h-0">
                        <div className="p-3 bg-slate-800/30 border-b border-slate-700 sticky top-0 flex justify-between items-center">
                            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                <ExternalLink className="w-4 h-4" /> {result.file2}
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-900 scrollbar-thin scrollbar-thumb-slate-700">
                            <HighlightedText
                                content={file2Content}
                                regions={regions}
                                activeIndex={currentRegionIndex}
                                isFile1={false}
                                activeRef={activeRef2}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
