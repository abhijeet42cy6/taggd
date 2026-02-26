import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText, MoreVertical, Search, Plus, Filter, ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/utils';

const API_BASE = "/api";

export const Projects = () => {
    const [projects, setProjects] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await axios.get(`${API_BASE}/projects`);
                setProjects(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchProjects();
    }, []);

    const filtered = projects.filter(p =>
        p.filename.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Project Vault</h1>
                    <p className="text-xs text-muted-foreground">Historical and active revenue audit records.</p>
                </div>
                <button
                    onClick={() => navigate('/upload')}
                    className="bg-primary text-black font-bold text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 hover:bg-primary/90 transition-transform active:scale-95"
                >
                    <Plus size={14} /> NEW AUDIT
                </button>
            </header>

            <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
                    <input
                        type="text"
                        placeholder="Query vault..."
                        className="w-full sb-bg-dark sb-border rounded py-1.5 pl-9 pr-4 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40 font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button className="sb-bg-dark sb-border px-3 py-1.5 rounded text-[11px] font-bold text-zinc-400 flex items-center gap-2 hover:bg-[#1a1a1a] transition-colors uppercase tracking-tighter">
                    <Filter size={12} /> Sort
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((project) => (
                    <div
                        key={project.id}
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="sb-bg-dark sb-border rounded-lg p-5 hover-card cursor-pointer group transition-all space-y-4"
                    >
                        <div className="flex justify-between items-start">
                            <div className="w-8 h-8 rounded bg-[#1a1a1a] flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors border border-[#2e2e2e]">
                                <FileText size={16} />
                            </div>
                            <button className="p-1 hover:bg-[#2a2a2a] rounded transition-colors text-zinc-600">
                                <MoreVertical size={14} />
                            </button>
                        </div>

                        <div>
                            <h3 className="font-bold text-sm leading-tight text-zinc-200 group-hover:text-primary transition-colors truncate">
                                {project.filename}
                            </h3>
                            <p className="text-[10px] text-zinc-500 font-mono mt-1">
                                {project.tracker_sheet} / {project.contract_sheet}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-green-500/10 border border-green-500/20 text-green-500 uppercase tracking-tighter">
                                Verified
                            </span>
                            <span className="text-[9px] text-zinc-600 font-mono">
                                0x{project.id.toString(16).padStart(4, '0')}
                            </span>
                        </div>

                        <div className="pt-3 border-t border-[#2e2e2e]/50 flex items-center justify-between">
                            <span className="text-[10px] text-zinc-600">
                                {new Date(project.created_at).toLocaleDateString()}
                            </span>
                            <ArrowUpRight size={14} className="text-zinc-700 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
