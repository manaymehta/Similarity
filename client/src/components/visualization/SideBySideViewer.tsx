import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComparisonResult, MatchType } from '../../services/api';

interface SideBySideViewerProps {
    result: ComparisonResult;
    file1Content: string;
    file2Content: string;
    onClose: () => void;
}

const MATCH_TYPE_CONFIG: Record<MatchType, { label: string; badge: string; highlight: string; border: string }> = {
    verbatim: {
        label: 'Verbatim',
        badge: 'bg-red-500/15 text-red-400 border border-red-500/30',
        highlight: 'bg-red-500/35 text-red-100',
        border: 'border-b border-red-400',
    },
    paraphrase: {
        label: 'Paraphrase',
        badge: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
        highlight: 'bg-orange-500/35 text-orange-100',
        border: 'border-b border-orange-400',
    },
    similar: {
        label: 'Similar',
        badge: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
        highlight: 'bg-yellow-500/35 text-yellow-100',
        border: 'border-b border-yellow-400',
    },
};

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

    const activeRef1 = useRef<HTMLSpanElement>(null);
    const activeRef2 = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (activeRef1.current) activeRef1.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (activeRef2.current) activeRef2.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [currentRegionIndex]);

    const activeRegion = hasRegions ? regions[currentRegionIndex] : null;
    const matchConfig = activeRegion
        ? (MATCH_TYPE_CONFIG[activeRegion.match_type] ?? MATCH_TYPE_CONFIG.similar)
        : null;

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
                            <div className="flex items-center gap-2">
                                {/* Match type badge for the active region */}
                                {matchConfig && (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${matchConfig.badge}`}>
                                        {matchConfig.label}
                                    </span>
                                )}

                                {/* Lexical score */}
                                {activeRegion && (
                                    <span className="text-xs text-slate-500 font-mono">
                                        lex {(activeRegion.lexical_score * 100).toFixed(0)}%
                                    </span>
                                )}

                                {/* Region navigation */}
                                <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
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

const HighlightedText = ({ content, regions, activeIndex, isFile1, activeRef }: {
    content: string,
    regions: ComparisonResult['regions'],
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

    const activeRegion = regions[activeIndex];
    if (!activeRegion) return <pre>{content}</pre>;

    const startChar = isFile1 ? activeRegion.a_start_char : activeRegion.b_start_char;
    const endChar = isFile1 ? activeRegion.a_end_char : activeRegion.b_end_char;

    if (startChar === undefined || endChar === undefined || startChar < 0 || endChar > content.length) {
        return <pre>{content}</pre>;
    }

    const config = MATCH_TYPE_CONFIG[activeRegion.match_type] ?? MATCH_TYPE_CONFIG.similar;

    const pre = content.substring(0, startChar);
    const match = content.substring(startChar, endChar);
    const post = content.substring(endChar);

    return (
        <pre className="whitespace-pre-wrap font-sans text-sm text-slate-300 leading-relaxed">
            {pre}
            <span
                ref={activeRef}
                className={`rounded px-0.5 ${config.highlight} ${config.border}`}
            >
                {match}
            </span>
            {post}
        </pre>
    );
};
