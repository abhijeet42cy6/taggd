import React, { useState } from 'react';
import axios from 'axios';
import {
    UploadCloud,
    CheckCircle2,
    Sparkles,
    ChevronRight,
    RefreshCcw,
    ArrowRight
} from 'lucide-react';
import { FileUpload } from '../components/FileUpload';
import { AgentConsole } from '../components/AgentConsole';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

const API_BASE = "/api";

export const Upload = () => {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
    const [logs, setLogs] = useState<string[]>([]);
    const [data, setData] = useState<any>(null);
    const navigate = useNavigate();

    const handleUpload = async (file: File) => {
        setStatus('uploading');
        setLogs(["[init] Initializing Agentic Pipeline...", `[file] Target: ${file.name}`]);

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Small delays to visualize the pipeline steps in the UI
            setTimeout(() => setLogs(prev => [...prev, "Step 1/4: Analyzing sheet hierarchy..."]), 800);

            const res = await axios.post(`${API_BASE}/upload`, formData);

            // Update logs sequentially for visual feedback
            setLogs(prev => [
                ...prev,
                "✅ Step 1: Sheets categorized.",
                `   - Tracker: ${res.data.sheets.tracker}`,
                `   - Contract: ${res.data.sheets.contract}`,
                "Step 2/4: Syncing columns to Universal Schema...",
                "✅ Step 2: Mapping complete.",
                "Step 3/4: Synthesizing Revenue logic from contract clauses...",
                "✅ Step 3: Logic generated.",
                "Step 4/4: Executing batch processing...",
                "✅ Step 4: Batch stored in DB."
            ]);

            setData(res.data);
            setStatus('success');

        } catch (err: any) {
            console.error(err);
            setStatus('error');
            const msg = err.response?.data?.detail || err.message;
            setLogs(prev => [...prev, `❌ Pipeline Error: ${msg}`]);
        }
    };

    const reset = () => {
        setStatus('idle');
        setLogs([]);
        setData(null);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
            <header className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Audit Upload</h1>
                <p className="text-muted-foreground text-sm">Upload a consolidated tracker to initiate agentic processing.</p>
            </header>

            <div className="space-y-6">
                {status === 'idle' ? (
                    <div className="animate-in zoom-in-95 duration-300">
                        <FileUpload status={status} onUpload={handleUpload} />
                    </div>
                ) : (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                                <Sparkles size={12} /> Live Engine Status
                            </div>
                            {status === 'error' && (
                                <button
                                    onClick={reset}
                                    className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <RefreshCcw size={10} /> Restart
                                </button>
                            )}
                        </div>

                        <AgentConsole
                            logs={logs}
                            mapping={data?.mapping}
                            explanation={data?.logic_explanation}
                            pythonCode={data?.python_code}
                        />

                        {status === 'success' && (
                            <div className="flex items-center justify-between p-3 sb-bg-dark border border-primary/20 rounded-lg animate-in slide-in-from-bottom-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                        <CheckCircle2 className="text-primary" size={16} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-xs">Ready for Review</p>
                                        <p className="text-[10px] text-muted-foreground">The audit is now live in the project view.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate(`/projects/${data.project_id}`)}
                                    className="bg-primary text-black text-[11px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1 hover:bg-primary/90"
                                >
                                    View Details <ArrowRight size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {status === 'idle' && (
                <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="p-3 sb-bg-dark sb-border rounded-lg space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Rate Limit Info</p>
                        <p className="text-xs">3 second inter-step cooldown active for API persistence.</p>
                    </div>
                    <div className="p-3 sb-bg-dark sb-border rounded-lg space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Supported Styles</p>
                        <p className="text-xs">Supports Honeywell, Maruti, and custom tabular formats.</p>
                    </div>
                </div>
            )}
        </div>
    );
};
