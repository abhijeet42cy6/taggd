import React, { useState } from 'react';
import axios from 'axios';
import {
    UploadCloud,
    CheckCircle2,
    Sparkles,
    ChevronRight,
    RefreshCcw,
    ArrowRight,
    Search,
    Layers,
    FileCode,
    Settings2,
    Activity,
    Zap
} from 'lucide-react';
import { FileUpload } from '@/components/FileUpload';
import { AgentConsole } from '@/components/AgentConsole';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const API_BASE = "/api";

export const Upload = () => {
    const [mode, setMode] = useState<'express' | 'pro'>('express');
    const [status, setStatus] = useState<'idle' | 'uploading' | 'inspecting' | 'processing' | 'success' | 'error'>('idle');
    const [logs, setLogs] = useState<string[]>([]);
    const [data, setData] = useState<any>(null);
    const [proConfig, setProConfig] = useState<any>(null);
    const navigate = useNavigate();

    const handleUpload = async (file: File) => {
        setStatus('uploading');
        setLogs(["[init] Initializing Agentic Pipeline...", `[file] Target: ${file.name}`, `[mode] Path: ${mode.toUpperCase()}`]);

        const formData = new FormData();
        formData.append('file', file);

        try {
            if (mode === 'express') {
                const res = await axios.post(`${API_BASE}/upload`, formData);
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
            } else {
                setStatus('inspecting');
                const res = await axios.post(`${API_BASE}/upload/pro/inspect`, formData);
                setLogs(prev => [
                    ...prev,
                    "⚡ Inspection Complete.",
                    `AI suggests ${res.data.suggested.data_sheets.length} data sheets.`,
                    "Please confirm the structure below."
                ]);
                setProConfig({
                    project_id: res.data.project_id,
                    data_sheets: res.data.suggested.data_sheets,
                    contract_sheet: res.data.suggested.contract_sheet,
                    all_sheets: res.data.all_sheets
                });
            }
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            const detail = err.response?.data?.detail;
            const msg = typeof detail === 'object' ? JSON.stringify(detail, null, 2) : (detail || err.message);
            setLogs(prev => [...prev, `❌ Pipeline Error (V2.1): ${msg}`]);
        }
    };

    const handleConfirmPro = async () => {
        setStatus('processing');
        setLogs(prev => [...prev, "🚀 [V2.1] Finalizing Multi-Sheet Pipeline...", "Executing Logic Synthesis & Multi-Sheet Processing..."]);

        try {
            const res = await axios.post(`${API_BASE}/upload/pro/confirm`, {
                project_id: proConfig.project_id,
                data_sheets: proConfig.data_sheets,
                contract_sheet: proConfig.contract_sheet
            });

            setLogs(prev => [
                ...prev,
                "✅ Multi-Sheet Sync Complete.",
                `   - Sheets Processed: ${res.data.data_sheets.join(', ')}`,
                "✅ Logic Synthesized.",
                "✅ Global DB Updated."
            ]);

            setData(res.data);
            setStatus('success');
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            const detail = err.response?.data?.detail;
            const msg = typeof detail === 'object' ? JSON.stringify(detail, null, 2) : (detail || err.message);
            setLogs(prev => [...prev, `❌ Confirmation Error (V2.1): ${msg}`]);
        }
    };

    const toggleSheetSelection = (sheet: string, type: 'data' | 'contract') => {
        if (type === 'data') {
            setProConfig((prev: any) => ({
                ...prev,
                data_sheets: prev.data_sheets.includes(sheet)
                    ? prev.data_sheets.filter((s: string) => s !== sheet)
                    : [...prev.data_sheets, sheet]
            }));
        } else {
            setProConfig((prev: any) => ({ ...prev, contract_sheet: sheet }));
        }
    };

    const reset = () => {
        setStatus('idle');
        setLogs([]);
        setData(null);
        setProConfig(null);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Command Center Ingestion</h1>
                    <p className="text-muted-foreground text-xs font-medium">Upload consolidated trackers to initiate the Agentic Sieve.</p>
                </div>

                {status === 'idle' && (
                    <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-[240px]">
                        <TabsList className="grid w-full grid-cols-2 h-9">
                            <TabsTrigger value="express" className="text-[10px] font-bold uppercase tracking-widest">Express</TabsTrigger>
                            <TabsTrigger value="pro" className="text-[10px] font-bold uppercase tracking-widest">Pro Path</TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}
            </header>

            <Separator className="opacity-50" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-7 space-y-6">
                    {status === 'idle' ? (
                        <div className="space-y-6">
                            <Alert className="bg-primary/5 border-primary/20">
                                <Zap size={14} className="text-primary" />
                                <AlertTitle className="text-[11px] font-bold uppercase tracking-widest text-primary/80">Mode Active: {mode.toUpperCase()}</AlertTitle>
                                <AlertDescription className="text-xs text-muted-foreground mt-1">
                                    {mode === 'express'
                                        ? "AI automatically identifies 1 Data sheet and 1 Logic sheet for rapid processing."
                                        : "Support for multiple Data sheets (e.g. Open + Closed) with manual verification matrix."}
                                </AlertDescription>
                            </Alert>
                            <FileUpload status={status} onUpload={handleUpload} />
                        </div>
                    ) : status === 'inspecting' && proConfig ? (
                        <Card className="bg-muted/30 border-border/50 overflow-hidden">
                            <CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/20 border-b border-border/50">
                                <div className="space-y-0.5">
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
                                        <Search size={12} className="text-primary" />
                                        Sheet Selection Matrix
                                    </CardTitle>
                                    <CardDescription className="text-[10px] font-mono italic">Finalize mapping for multi-sheet sync...</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 space-y-8">
                                <section className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none h-4">
                                            <Layers size={12} className="text-blue-500" /> Data Sources
                                        </div>
                                        <Badge variant="outline" className="h-4 text-[8px] font-bold opacity-50 border-white/10 uppercase">Select records</Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {proConfig.all_sheets.map((sheet: string) => (
                                            <Button
                                                key={sheet}
                                                variant={proConfig.data_sheets.includes(sheet) ? "secondary" : "ghost"}
                                                onClick={() => toggleSheetSelection(sheet, 'data')}
                                                className={cn(
                                                    "h-auto py-3 justify-between px-4 text-[11px] font-semibold border transition-all",
                                                    proConfig.data_sheets.includes(sheet)
                                                        ? "border-blue-500/50 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10"
                                                        : "border-border/50 text-muted-foreground"
                                                )}
                                            >
                                                <span className="truncate mr-2">{sheet}</span>
                                                {proConfig.data_sheets.includes(sheet) && <div className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]" />}
                                            </Button>
                                        ))}
                                    </div>
                                </section>

                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none h-4">
                                        <FileCode size={12} className="text-primary" /> Revenue Logic
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {proConfig.all_sheets.map((sheet: string) => (
                                            <Button
                                                key={sheet}
                                                variant={proConfig.contract_sheet === sheet ? "secondary" : "ghost"}
                                                onClick={() => toggleSheetSelection(sheet, 'contract')}
                                                className={cn(
                                                    "h-auto py-3 justify-start px-4 text-[11px] font-semibold border transition-all",
                                                    proConfig.contract_sheet === sheet
                                                        ? "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10"
                                                        : "border-border/50 text-muted-foreground"
                                                )}
                                            >
                                                {sheet}
                                            </Button>
                                        ))}
                                    </div>
                                </section>
                            </CardContent>
                            <CardFooter className="p-0">
                                <Button
                                    onClick={handleConfirmPro}
                                    disabled={proConfig.data_sheets.length === 0 || !proConfig.contract_sheet}
                                    className="w-full h-14 rounded-none text-xs font-bold uppercase tracking-widest gap-2"
                                >
                                    Initialize Engine <ArrowRight size={16} />
                                </Button>
                            </CardFooter>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            <AgentConsole
                                logs={logs}
                                mapping={data?.mapping}
                                explanation={data?.logic_explanation}
                                pythonCode={data?.python_code}
                            />

                            {status === 'success' && (
                                <Card className="bg-muted/30 border-primary/20 overflow-hidden">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                                                <CheckCircle2 className="text-primary" size={20} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm tracking-tight">Audit Synchronized</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Row-level precision verification complete.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Button variant="ghost" size="sm" onClick={reset} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">Another</Button>
                                            <Button
                                                size="sm"
                                                onClick={() => navigate(`/projects/${data.project_id}`)}
                                                className="h-9 px-4 text-[11px] font-bold gap-2"
                                            >
                                                Vault <ArrowRight size={12} />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-5 space-y-6">
                    <Card className="bg-muted/30 border-border/50">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
                                <Activity size={12} className="text-primary" />
                                Engine Insights
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {[
                                { label: 'Universal Mapping', value: '1:1 Sync', desc: 'Syncs Excel columns to Central DB schema instantly.' },
                                { label: 'Multi-Sheet Sieve', value: 'Active', desc: 'Deduplicates candidates across split Open/Closed sheets.' },
                                { label: 'Financial Inference', value: 'Gemini-Flash', desc: 'Reads natural language contracts to write code.' },
                            ].map((item, i) => (
                                <div key={i} className="group border-l-2 border-border/50 pl-4 hover:border-primary/50 transition-colors">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="text-[11px] font-extrabold text-foreground">{item.label}</span>
                                        <Badge variant="outline" className="h-4 text-[8px] font-bold text-primary border-primary/20 bg-primary/5">{item.value}</Badge>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-relaxed font-medium">{item.desc}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20 relative overflow-hidden group">
                        <CardContent className="p-6 relative z-10 space-y-3">
                            <h4 className="text-[11px] font-bold text-foreground uppercase tracking-tight">Zero-Loss Guarantee</h4>
                            <p className="text-[9px] text-muted-foreground leading-relaxed font-medium">
                                Every row is processed through the digital sieve. Junk data (totals/noise) is filtered, while real jobs are tracked with 100% fidelity.
                            </p>
                        </CardContent>
                        <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                            <CheckCircle2 size={120} />
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

