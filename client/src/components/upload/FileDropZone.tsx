import React, { useCallback, useState } from 'react';
import { UploadCloud, X, FileText } from 'lucide-react';
import clsx from 'clsx';

interface FileDropZoneProps {
    onFilesSelected: (files: File[]) => void;
    disabled?: boolean;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onFilesSelected, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(Array.from(e.dataTransfer.files));
            e.dataTransfer.clearData();
        }
    }, [disabled, onFilesSelected]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(Array.from(e.target.files));
        }
    };

    return (
        <div
            className={clsx(
                "relative border-2 border-dashed rounded-xl p-10 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-4",
                isDragging
                    ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
                    : "border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600",
                disabled && "opacity-50 cursor-not-allowed grayscale pointer-events-none"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
        >
            <input
                type="file"
                id="file-upload"
                className="hidden"
                multiple
                onChange={handleFileInput}
                disabled={disabled}
            />

            <div className="p-4 bg-slate-900 rounded-full ring-4 ring-slate-800">
                <UploadCloud className="w-10 h-10 text-blue-400" />
            </div>

            <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold text-slate-100">
                    Click to upload or drag and drop
                </h3>
                <p className="text-sm text-slate-400">
                    Supports .txt, .pdf, .docx, .py, .js (Max 5MB)
                </p>
            </div>
        </div>
    );
};

interface UploadListProps {
    files: File[];
    onRemove: (index: number) => void;
}

export const UploadList: React.FC<UploadListProps> = ({ files, onRemove }) => {
    if (files.length === 0) return null;

    return (
        <div className="mt-6 space-y-3">
            <h4 className="text-sm font-medium text-slate-400 pl-1">Selected Files ({files.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {files.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700 rounded-lg group hover:border-slate-600 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-2 bg-slate-900/50 rounded-md shrink-0">
                                <FileText className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
                                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        </div>
                        <button
                            onClick={() => onRemove(idx)}
                            className="p-1 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Remove file"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
