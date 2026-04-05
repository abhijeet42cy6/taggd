import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText, MoreVertical, Search, Plus, Filter, ArrowUpRight, Database, FolderOpen, History } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const API_BASE = "/api";

export const Projects = () => {
    const [projects, setProjects] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await axios.get(`${API_BASE}/projects`);
                setProjects(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchProjects();
    }, []);

    const filtered = projects.filter(p =>
        (p.account_name && p.account_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        p.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.tracker_sheet && p.tracker_sheet.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest border-green-500/50 text-green-500 gap-1.5 h-5 px-2 bg-green-500/5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                            Live Vault Active
                        </Badge>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Project Vault</h1>
                    <p className="text-xs text-muted-foreground font-medium">Historical audit metadata and logic repositories.</p>
                </div>
                <Button
                    onClick={() => navigate('/upload')}
                    className="h-9 px-4 text-[11px] font-bold uppercase tracking-widest gap-2"
                >
                    <Plus size={14} /> NEW INGESTION
                </Button>
            </header>

            <Separator className="opacity-50" />

            <div className="flex gap-2 items-center">
                <div className="relative flex-1 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={14} />
                    <Input
                        type="text"
                        placeholder="Search by filename or client..."
                        className="pl-10 h-10 text-[12px] bg-muted/30 border-border/50 focus-visible:ring-primary/40"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" className="h-10 px-4 text-[11px] font-bold text-muted-foreground border-border/50 gap-2">
                    <Filter size={14} /> FILTERS
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                        <Card key={i} className="h-44 bg-muted/20 border-border/50 animate-pulse" />
                    ))
                ) : filtered.length > 0 ? (
                    filtered.map((project) => (
                        <Card
                            key={project.id}
                            onClick={() => navigate(`/projects/${project.id}`)}
                            className="bg-muted/30 border-border/50 hover:border-primary/40 transition-all cursor-pointer group flex flex-col justify-between overflow-hidden relative"
                        >
                            <CardHeader className="p-5 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="w-9 h-9 rounded-md bg-background flex items-center justify-center border border-border/50 group-hover:border-primary/40 group-hover:text-primary transition-all">
                                        <FileText size={18} />
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                                                <MoreVertical size={14} className="text-muted-foreground/50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}`)}>View Details</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive">Archive Record</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardHeader>

                            <CardContent className="px-5 pb-4">
                                <div className="space-y-1.5">
                                    <h3 className="font-bold text-sm tracking-tight text-foreground group-hover:text-primary transition-colors truncate">
                                        {project.account_name || project.filename}
                                    </h3>
                                    <div className="flex flex-col gap-1">
                                        {project.account_name && (
                                            <p className="text-[9px] text-muted-foreground/60 truncate italic font-medium">
                                                Source: {project.filename}
                                            </p>
                                        )}
                                        <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 mt-1">
                                            <Database size={10} className="text-muted-foreground/40" />
                                            {project.id === 11 ? "Honeywell Master" : project.tracker_sheet}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 mt-4">
                                    <Badge
                                        variant="secondary"
                                        className={cn(
                                            "text-[9px] font-bold px-1.5 h-4 uppercase tracking-tighter",
                                            project.id === 11 ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-primary/10 text-primary border-primary/20"
                                        )}
                                    >
                                        {project.id === 11 ? "LEGACY_DATA" : "VERIFIED_AUDIT"}
                                    </Badge>
                                    <span className="text-[9px] text-muted-foreground/40 font-mono tracking-tighter uppercase">
                                        #PID-{project.id.toString().padStart(4, '0')}
                                    </span>
                                </div>
                            </CardContent>

                            <CardFooter className="px-5 py-3 border-t border-border/20 flex justify-between items-center bg-muted/20">
                                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                                    <History size={10} />
                                    <span className="text-[9px] font-medium tracking-tight">
                                        {formatDate(project.created_at)}
                                    </span>
                                </div>
                                <ArrowUpRight size={14} className="text-muted-foreground/20 group-hover:text-primary transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </CardFooter>
                        </Card>
                    ))
                ) : (
                    <div className="col-span-full py-24 flex flex-col items-center justify-center bg-muted/10 border border-dashed border-border/50 rounded-lg">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground/30 mb-6">
                            <Database size={32} />
                        </div>
                        <h2 className="text-lg font-bold text-foreground">Vault is Empty</h2>
                        <p className="text-xs text-muted-foreground mt-2 max-w-[240px] text-center leading-relaxed">
                            No revenue projects were found in the database. Restore from records or upload a new XLSX file.
                        </p>
                        <Button
                            onClick={() => navigate('/upload')}
                            className="mt-8 px-6 h-10 text-[10px] font-black uppercase tracking-widest"
                        >
                            Begin First Ingestion
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
