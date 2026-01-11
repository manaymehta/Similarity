import React, { useMemo } from 'react';
import clsx from 'clsx';
import type { ComparisonResult } from '../../services/api';

interface HeatmapProps {
    results: ComparisonResult[];
    filenames: string[];
    onCellClick?: (result: ComparisonResult) => void;
}

export const Heatmap: React.FC<HeatmapProps> = ({ results, filenames, onCellClick }) => {
    // Create a normalized matrix map
    const matrix = useMemo(() => {
        const map = new Map<string, number>();
        results.forEach((res) => {
            // Store both directions for easier lookup (SimMatrix is symmetric usually)
            map.set(`${res.file1}:${res.file2}`, res.score);
            map.set(`${res.file2}:${res.file1}`, res.score);
        });
        return map;
    }, [results]);

    const getScore = (f1: string, f2: string) => {
        if (f1 === f2) return 1.0;
        return matrix.get(`${f1}:${f2}`) || 0;
    };

    const getColor = (score: number) => {
        if (score === 1) return 'bg-blue-500'; // Identity
        if (score > 0.8) return 'bg-red-500';
        if (score > 0.6) return 'bg-orange-500';
        if (score > 0.4) return 'bg-yellow-500';
        if (score > 0.2) return 'bg-green-500';
        return 'bg-slate-800'; // Low similarity
    };

    const getOpacity = (score: number) => {
        if (score === 1) return 1;
        // Map 0-1 score to 0.2-1 opacity for visibility
        return 0.2 + (score * 0.8);
    };

    return (
        <div className="overflow-x-auto p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-inner scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="min-w-max">
                {/* Header Row */}
                <div className="flex">
                    <div className="w-32 h-10 shrink-0"></div> {/* Corner Spacer */}
                    {filenames.map((file, i) => (
                        <div key={`col-${i}`} className="w-16 px-1 flex items-end justify-center pb-2">
                            <span className="text-xs text-slate-400 rotate-[-45deg] origin-bottom-left truncate w-20 block" title={file}>
                                {file.length > 10 ? file.slice(0, 8) + '..' : file}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Rows */}
                {filenames.map((rowFile, i) => (
                    <div key={`row-${i}`} className="flex items-center">
                        {/* Row Label */}
                        <div className="w-32 py-2 pr-4 flex justify-end">
                            <span className="text-xs text-slate-400 truncate w-full text-right" title={rowFile}>
                                {rowFile}
                            </span>
                        </div>

                        {/* Cells */}
                        {filenames.map((colFile, j) => {
                            const score = getScore(rowFile, colFile);
                            const isIdentity = rowFile === colFile;

                            return (
                                <div
                                    key={`cell-${i}-${j}`}
                                    className="w-16 h-12 p-1 relative group"
                                >
                                    <button
                                        onClick={() => {
                                            if (!isIdentity && onCellClick) {
                                                // Find original result object
                                                const res = results.find(
                                                    r => (r.file1 === rowFile && r.file2 === colFile) ||
                                                        (r.file1 === colFile && r.file2 === rowFile)
                                                );
                                                if (res) onCellClick(res);
                                            }
                                        }}
                                        disabled={isIdentity}
                                        className={clsx(
                                            "w-full h-full rounded transition-transform hover:scale-110 flex items-center justify-center",
                                            getColor(score),
                                            isIdentity ? "cursor-default opacity-50" : "cursor-pointer"
                                        )}
                                        style={{ opacity: isIdentity ? 0.3 : getOpacity(score) }}
                                        title={`${rowFile} vs ${colFile}: ${(score * 100).toFixed(1)}%`}
                                    >
                                        <span className="text-[10px] font-bold text-white/90 drop-shadow-sm">
                                            {(score * 100).toFixed(0)}%
                                        </span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};
