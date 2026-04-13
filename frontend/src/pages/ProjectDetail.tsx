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
    X,
    ExternalLink,
    FileText
} from 'lucide-react';
import { RecordTable } from '@/components/RecordTable';
import { formatCurrency, cn } from '@/lib/utils';
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

const API_BASE = "/api";

export const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState<any>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [recalculating, setRecalculating] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [projRes, recsRes] = await Promise.all([
                    axios.get(`${API_BASE}/projects/${id}`),
                    axios.get(`${API_BASE}/projects/${id}/records`)
                ]);
                setProject(projRes.data);
                setRecords(recsRes.data || []);
            } catch (err: any) {
                console.error(err);
                setError(err.response?.status === 404 ? "Project Ledger Not Found" : "Failed to load audit intelligence");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const fetchData = async () => {
        try {
            const [projRes, recsRes] = await Promise.all([
                axios.get(`${API_BASE}/projects/${id}`),
                axios.get(`${API_BASE}/projects/${id}/records`)
            ]);
            setProject(projRes.data);
            setRecords(recsRes.data || []);
        } catch (err: any) {
            console.error(err);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await axios.delete(`${API_BASE}/projects/${id}`);
            navigate('/projects');
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const handleRecalculate = async () => {
        setRecalculating(true);
        try {
            await axios.post(`${API_BASE}/projects/${id}/recalculate`);
            await fetchData();
        } catch (err) {
            console.error(err);
        } finally {
            setRecalculating(false);
        }
    };

    const handleRegenerate = async () => {
        setRegenerating(true);
        try {
            await axios.post(`${API_BASE}/projects/${id}/logic/regenerate`);
            await fetchData();
        } catch (err) {
            console.error(err);
        } finally {
            setRegenerating(false);
        }
    };

    if (loading) return (
        <div className="h-96 flex flex-col items-center justify-center text-muted-foreground animate-pulse gap-3">
            <div className="w-12 h-12 rounded-full border-t-2 border-primary animate-spin" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">Initializing Ledger Protocol...</span>
        </div>
    );
    
    if (error || !project) return (
        <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                <AlertTriangle size={32} />
            </div>
            <div className="text-center space-y-1">
                <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">{error || "Critical Sync Failure"}</h3>
                <p className="text-[10px] opacity-60 font-mono tracking-tight max-w-[280px]">The requested ledger could not be reconciled with the database cluster.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects')} className="h-8 text-[10px] font-black uppercase tracking-widest gap-2 mt-4 hover:bg-muted">
                <ArrowLeft size={14} /> Back to Vault
            </Button>
        </div>
    );

    const totalRevenue = records.reduce((acc, r) => acc + (r.revenue_results?.revenue || 0), 0);
    const totalJoinees = records.filter(r => (r.status || '').toLowerCase().includes('joined')).length;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500 pb-20 max-w-[1400px] mx-auto">

            {/* Breadcrumb / Nav */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/projects')}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft size={16} />
                    </Button>
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                        <span>Vault</span>
                        <ChevronRight size={10} className="opacity-50" />
                        <span className="text-foreground">{project.account_name || project.filename}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/transitions?project=${id}`)}
                        className="h-8 text-[10px] font-bold gap-2 uppercase tracking-wider"
                    >
                        <FileText size={14} /> Transition
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRecalculate}
                        disabled={recalculating}
                        className="h-8 text-[10px] font-bold gap-2 uppercase tracking-wider border-primary/20 hover:bg-primary/5 text-primary"
                    >
                        <Layers size={14} className={recalculating ? "animate-spin" : ""} /> 
                        {recalculating ? "Recalculating..." : "Recalculate Ledger"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold gap-2 uppercase tracking-wider">
                        <Download size={14} /> Export CSV
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowDeleteModal(true)}
                        className="h-8 text-[10px] font-bold gap-2 uppercase tracking-wider bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white"
                    >
                        <Trash2 size={14} /> Delete Audit
                    </Button>
                </div>
            </div>

            <Separator className="opacity-50" />

            <AlertDialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <AlertDialogContent className="bg-background border-border shadow-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-red-500">
                            <AlertTriangle size={16} /> Delete Project Data
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs pt-2 leading-relaxed">
                            This will permanently remove <span className="font-bold text-foreground">{project.account_name || project.filename}</span> and <span className="font-bold text-foreground">{records.length} validated records</span>. Synthesized revenue logic will also be lost.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-4">
                        <AlertDialogCancel disabled={deleting} className="text-[10px] font-bold uppercase tracking-widest h-9">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleDelete();
                            }}
                            disabled={deleting}
                            className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-widest h-9"
                        >
                            {deleting ? "Deleting..." : "Confirm Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.account_name || project.filename}</h1>
                    <Badge variant="outline" className="text-[8px] font-black uppercase tracking-tighter bg-primary/5 text-primary border-primary/20 h-5">
                        Active Audit
                    </Badge>
                </div>
                {project.account_name && (
                    <p className="text-[10px] text-muted-foreground italic -mt-1 font-medium">
                        Audited Source: {project.filename}
                    </p>
                )}
                <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Layers size={12} className="opacity-70" /> {project.tracker_sheet}</div>
                    <div className="flex items-center gap-1.5"><Calendar size={12} className="opacity-70" /> Compiled {new Date(project.created_at).toLocaleDateString()}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { title: "Project Yield", value: formatCurrency(totalRevenue), color: "text-primary" },
                    { title: "Audited Rows", value: records.length, color: "text-foreground" },
                    { title: "Joinees", value: totalJoinees, color: "text-foreground" },
                    { title: "Avg Yield / Unit", value: records.length ? formatCurrency(totalRevenue / records.length) : '₹0', color: "text-foreground" }
                ].map((stat, i) => (
                    <Card key={i} className="bg-muted/30 border-border/50">
                        <CardHeader className="p-4 pb-0">
                            <CardTitle className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">{stat.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-1">
                            <div className={cn("text-xl font-bold tracking-tight", stat.color)}>{stat.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {(project.logic_explanation || project.revenue_logic_code) && (
                <Card className="bg-muted/30 border-border/50 overflow-hidden">
                    <CardHeader className="flex flex-row items-center gap-3 px-5 py-3 border-b border-border/50 bg-muted/20">
                        <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 transition-transform hover:scale-105">
                            <BookOpen size={14} />
                        </div>
                        <div className="flex-1">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Revenue Calculation Engine</CardTitle>
                            <CardDescription className="text-[9px] font-medium text-muted-foreground/60 mt-0.5">AI-synthesized terms from central contract database</CardDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRegenerate}
                            disabled={regenerating}
                            className="h-7 text-[9px] font-bold gap-2 uppercase tracking-widest text-primary hover:bg-primary/5 border border-primary/10"
                        >
                            <Code size={12} className={regenerating ? "animate-spin" : ""} />
                            {regenerating ? "Analysing..." : "Regenerate Intelligence"}
                        </Button>
                    </CardHeader>

                    <CardContent className="p-0">
                        {project.logic_explanation && (
                            <div className="px-5 py-4 border-b border-border/50">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Natural Language Policy</p>
                                <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                                    {project.logic_explanation}
                                </p>
                            </div>
                        )}

                        {project.revenue_logic_code && (
                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="code" className="border-none">
                                    <AccordionTrigger className="px-5 py-2.5 text-[10px] font-bold text-muted-foreground hover:no-underline hover:bg-muted/50 transition-colors uppercase tracking-widest">
                                        <div className="flex items-center gap-2">
                                            <Code size={12} className="text-primary" />
                                            <span>Synthesized Execution Code</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-0 border-t border-border/50">
                                        <div className="bg-black/40 p-5 overflow-x-auto">
                                            <pre className="font-mono text-[10px] text-muted-foreground leading-relaxed whitespace-pre">
                                                {project.revenue_logic_code}
                                            </pre>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        )}
                    </CardContent>
                </Card>
            )}

            <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <FileText size={14} className="text-muted-foreground" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Audit Trail & Transaction Ledger</h2>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono h-5 opacity-60">{records.length} validated entries</Badge>
                </div>
                <RecordTable records={records} />
            </div>
        </div>
    );
};
