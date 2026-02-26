import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowLeft,
    Code,
    Calendar,
    Layers,
    Download,
    ChevronRight,
    BookOpen,
    ChevronDown,
    ChevronUp,
    Trash2,
    AlertTriangle,
    X
} from 'lucide-react';
import { GlowCard } from '../components/GlowCard';
import { RecordTable } from '../components/RecordTable';
import { formatCurrency } from '../lib/utils';

const API_BASE = "/api";

export const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState<any>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCode, setShowCode] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [projRes, recsRes] = await Promise.all([
                    axios.get(`${API_BASE}/projects/${id}`),
                    axios.get(`${API_BASE}/projects/${id}/records`)
                ]);
                setProject(projRes.data);
                setRecords(recsRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await axios.delete(`${API_BASE}/projects/${id}`);
            navigate('/projects');
        } catch (err) {
            console.error(err);
            setDeleting(false);
        }
    };

    if (loading) return (
        <div className="h-96 flex items-center justify-center text-muted-foreground animate-pulse text-xs font-mono">
            Fetching ledger state...
        </div>
    );

    const totalRevenue = records.reduce((acc, r) => acc + (r.revenue_results?.revenue || 0), 0);
    const totalJoinees = records.filter(r => (r.status || '').toLowerCase().includes('joined')).length;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500 pb-20">

            {/* Breadcrumb Nav */}
            <nav className="flex items-center justify-between border-b border-[#2e2e2e] pb-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/projects')}
                        className="p-1.5 hover:bg-[#1a1a1a] rounded-md transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-zinc-500">projects</span>
                        <ChevronRight size={10} className="text-zinc-600" />
                        <span className="text-zinc-200">{project.filename}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="bg-[#1c1c1c] sb-border px-3 py-1 text-[11px] font-bold text-zinc-300 rounded flex items-center gap-2 hover:bg-[#242424] transition-colors">
                        <Download size={12} /> EXPORT LEDGER
                    </button>
                    <button
                        onClick={() => setShowDeleteModal(true)}
                        className="bg-red-500/10 border border-red-500/20 px-3 py-1 text-[11px] font-bold text-red-400 rounded flex items-center gap-2 hover:bg-red-500/20 transition-colors"
                    >
                        <Trash2 size={12} /> DELETE CLIENT
                    </button>
                </div>
            </nav>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div
                    className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    onClick={() => !deleting && setShowDeleteModal(false)}
                >
                    <div
                        className="bg-[#171717] border border-red-500/20 rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                    <AlertTriangle size={16} className="text-red-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-zinc-100">Delete Client</h3>
                                    <p className="text-[10px] text-zinc-500 mt-0.5">This action cannot be undone</p>
                                </div>
                            </div>
                            {!deleting && (
                                <button onClick={() => setShowDeleteModal(false)} className="text-zinc-600 hover:text-zinc-300 p-1">
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg px-4 py-3">
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                                You are about to permanently delete <span className="font-bold text-zinc-200">{project.filename}</span>{' '}
                                and all <span className="font-bold text-zinc-200">{records.length} associated records</span>.
                                The synthesized logic and all extracted revenue data will also be removed.
                            </p>
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleting}
                                className="flex-1 py-2 text-[11px] font-bold text-zinc-400 bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg hover:bg-[#222] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 py-2 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {deleting ? (
                                    <><span className="animate-spin inline-block w-3 h-3 border border-white/30 border-t-white rounded-full" /> Deleting...</>
                                ) : (
                                    <><Trash2 size={12} /> Confirm Delete</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Title */}
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-white">{project.filename}</h1>
                    <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-tighter">
                        Active Audit
                    </div>
                </div>
                <div className="flex items-center gap-6 text-[11px] font-medium text-zinc-500">
                    <div className="flex items-center gap-1.5"><Layers size={12} className="text-zinc-700" /> {project.tracker_sheet}</div>
                    <div className="flex items-center gap-1.5"><Calendar size={12} className="text-zinc-700" /> Compiled {new Date(project.created_at).toLocaleDateString()}</div>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <GlowCard title="Project Yield" value={formatCurrency(totalRevenue)} className="sb-bg-dark sb-border !p-4" />
                <GlowCard title="Audited Rows" value={records.length} className="sb-bg-dark sb-border !p-4" />
                <GlowCard title="Joinees" value={totalJoinees} className="sb-bg-dark sb-border !p-4" />
                <GlowCard
                    title="Avg Revenue / Row"
                    value={records.length ? formatCurrency(totalRevenue / records.length) : '₹0'}
                    className="sb-bg-dark sb-border !p-4"
                />
            </div>

            {/* Revenue Logic Card */}
            {(project.logic_explanation || project.revenue_logic_code) && (
                <div className="bg-[#171717] border border-[#2e2e2e] rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-[#2e2e2e]">
                        <div className="w-7 h-7 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                            <BookOpen size={13} />
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Revenue Calculation Logic</p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">AI-synthesized from the contract terms for this client</p>
                        </div>
                    </div>

                    {/* NL Explanation */}
                    {project.logic_explanation && (
                        <div className="px-5 py-4 border-b border-[#2e2e2e]">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Plain English Explanation</p>
                            <p className="text-[13px] text-zinc-300 leading-relaxed">
                                {project.logic_explanation}
                            </p>
                        </div>
                    )}

                    {/* Expandable Code */}
                    {project.revenue_logic_code && (
                        <div>
                            <button
                                onClick={() => setShowCode(s => !s)}
                                className="w-full flex items-center justify-between px-5 py-2.5 text-[11px] font-bold text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Code size={12} />
                                    <span>View Synthesized Python Code</span>
                                </div>
                                {showCode ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            {showCode && (
                                <div className="border-t border-[#2e2e2e] bg-black/50">
                                    <pre className="px-5 py-4 font-mono text-[11px] text-zinc-400 overflow-x-auto whitespace-pre leading-relaxed">
                                        {project.revenue_logic_code}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Transaction Ledger */}
            <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Transaction Ledger</h2>
                    <div className="text-[10px] text-zinc-600 font-mono italic">{records.length} validated entries</div>
                </div>
                <RecordTable records={records} />
            </div>
        </div>
    );
};
