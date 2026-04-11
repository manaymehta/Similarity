import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSystemMetrics, type SystemMetrics } from '../services/api';
import { Loader2, ArrowLeft, Database, HardDrive, Box, ChevronDown, ChevronUp, Server } from 'lucide-react';

export const SystemDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Expandable states
    const [redisExpanded, setRedisExpanded] = useState(false);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const data = await getSystemMetrics();
                setMetrics(data);
            } catch (err) {
                console.error('Failed to fetch system metrics:', err);
                setError('Failed to connect to backend services.');
            } finally {
                setLoading(false);
            }
        };

        // eslint-disable-next-line
        fetchMetrics();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    if (error || !metrics) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Server className="w-16 h-16 text-red-500" />
                <h2 className="text-2xl font-bold text-slate-200">System Offline</h2>
                <p className="text-slate-400">{error}</p>
                <button
                    onClick={() => navigate('/')}
                    className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
                >
                    Go Back Home
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center gap-4 border-b border-slate-800 pb-6">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Server className="w-8 h-8 text-blue-500" />
                        System Statistics
                    </h1>
                    <p className="text-slate-400 mt-1 pl-11">Real-time database storage metrics</p>
                </div>
            </div>

            {/* High-Level Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* MongoDB Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/20 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3 mb-4 text-green-400">
                        <Database className="w-6 h-6" />
                        <h2 className="text-lg font-semibold text-slate-200">MongoDB</h2>
                    </div>
                    <div className="space-y-4 border-t border-slate-800/50 pt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Indexed Files</span>
                            <span className="text-xl font-mono text-white">{metrics.mongodb.documents}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Scan Groups</span>
                            <span className="text-xl font-mono text-white">{metrics.mongodb.groups}</span>
                        </div>
                    </div>
                </div>

                {/* ChromaDB Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/20 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3 mb-4 text-purple-400">
                        <Box className="w-6 h-6" />
                        <h2 className="text-lg font-semibold text-slate-200">ChromaDB</h2>
                    </div>
                    <div className="space-y-4 border-t border-slate-800/50 pt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Vector Chunks</span>
                            <span className="text-xl font-mono text-white">{metrics.chromadb.chunks}</span>
                        </div>
                        <div className="flex justify-between items-center opacity-0 pointer-events-none">
                            <span className="text-slate-400 text-sm">Placeholder</span>
                            <span className="text-xl font-mono text-white">0</span>
                        </div>
                    </div>
                </div>

                {/* Redis Card (Summary) */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/20 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3 mb-4 text-red-500">
                        <HardDrive className="w-6 h-6" />
                        <h2 className="text-lg font-semibold text-slate-200">Redis Cache</h2>
                    </div>
                    <div className="space-y-4 border-t border-slate-800/50 pt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Active Pairs</span>
                            <span className="text-xl font-mono text-white">{metrics.redis.totalPairsCached}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expandable Detailed Sections */}
            <div className="space-y-4 pt-6">
                {/* Redis Deep Dive */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden transition-all duration-300">
                    <button
                        onClick={() => setRedisExpanded(!redisExpanded)}
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <HardDrive className="w-5 h-5 text-red-500/70" />
                            <h3 className="text-lg font-medium text-slate-200">Redis Cache Storage Detailed View</h3>
                            <span className="text-xs font-mono px-2 py-1 bg-red-500/10 text-red-400 rounded-full border border-red-500/20">
                                {metrics.redis.totalPairsCached} Records
                            </span>
                        </div>
                        {redisExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                    </button>

                    {redisExpanded && (
                        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
                            {metrics.redis.pairs.length === 0 ? (
                                <p className="text-slate-500 text-center py-6">No cached comparisons currently stored in Redis.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-400">
                                        <thead className="text-xs text-slate-500 uppercase bg-slate-900/50 border-b border-slate-800">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Comparison Pair</th>
                                                <th className="px-4 py-3 font-medium">Time To Live (TTL)</th>
                                                <th className="px-4 py-3 font-medium hidden md:table-cell">Raw Cache Key</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {metrics.redis.pairs.map((pair) => (
                                                <tr key={pair.key} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-slate-300">
                                                        {pair.file1} <span className="text-slate-500 mx-2">↔</span> {pair.file2}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono">
                                                        <span className={`px-2 py-1 rounded text-xs ${pair.ttl > 86400 * 3 ? 'bg-green-500/10 text-green-400' : pair.ttl > 86400 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                                                            {pair.ttl > 0 ? `${(pair.ttl / 86400).toFixed(1)} Days` : 'Expired'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs text-slate-600 hidden md:table-cell truncate max-w-xs" title={pair.key}>
                                                        {pair.key}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
