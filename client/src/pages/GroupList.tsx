import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGroups, type Group } from '../services/api';
import { Loader2, ArrowLeft, Calendar, FileText, CheckCircle2 } from 'lucide-react';

export const GroupList: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getGroups()
            .then(setGroups)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-3xl font-bold text-white">Past Scans</h1>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {groups.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                        <p>No scans found. Create your first group!</p>
                    </div>
                ) : (
                    groups.map((group) => (
                        <div
                            key={group._id}
                            onClick={() => navigate(`/report/${group._id}`)}
                            className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/80 transition-all group"
                        >
                            <div className="space-y-1">
                                <h3 className="text-xl font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">
                                    {group.name}
                                </h3>
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-4 h-4" />
                                        {new Date(group.createdAt).toLocaleDateString()}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <FileText className="w-4 h-4" />
                                        {group.files.length} files
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-medium border border-green-500/20 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {group.status}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
