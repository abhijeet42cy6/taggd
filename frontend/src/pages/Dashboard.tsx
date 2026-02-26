import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, Users, Briefcase, BarChart, ExternalLink, ArrowRight } from 'lucide-react';
import { GlowCard } from '../components/GlowCard';
import { StatsDashboard } from '../components/StatsDashboard';
import { formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

const API_BASE = "/api";

export const Dashboard = () => {
    const [stats, setStats] = useState<any>(null);
    const [drilldown, setDrilldown] = useState<any[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const statsRes = await axios.get(`${API_BASE}/stats/global`);
                setStats(statsRes.data);
                const drillRes = await axios.get(`${API_BASE}/stats/drilldown?field=hiring_manager`);
                setDrilldown(drillRes.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Organization Audit</h1>
                    <p className="text-xs text-muted-foreground">Aggregated performance across active pipelines.</p>
                </div>
                <button
                    onClick={() => navigate('/upload')}
                    className="text-primary text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 hover:underline"
                >
                    Build Report <ArrowRight size={12} />
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <GlowCard
                    title="Consolidated Rev"
                    value={stats ? formatCurrency(stats.total_revenue) : '₹0'}
                    icon={<TrendingUp size={14} />}
                    className="sb-bg-dark sb-border !p-4"
                />
                <GlowCard
                    title="Joinee Count"
                    value={stats ? stats.total_joinees : '0'}
                    icon={<Users size={14} />}
                    className="sb-bg-dark sb-border !p-4"
                />
                <GlowCard
                    title="Client Base"
                    value={stats ? stats.total_projects : '0'}
                    icon={<Briefcase size={14} />}
                    className="sb-bg-dark sb-border !p-4"
                />
                <GlowCard
                    title="Unit Density"
                    value={stats ? Math.round(stats.total_records / stats.total_projects) : '0'}
                    icon={<BarChart size={14} />}
                    className="sb-bg-dark sb-border !p-4"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <StatsDashboard title="Resource Performance" data={drilldown} />
                </div>
                <div className="lg:col-span-4 sb-bg-dark sb-border rounded-lg p-5 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#555]">Fast Operations</h3>
                    <div className="space-y-1.5">
                        {[
                            { label: 'Import Position Tracker', action: () => navigate('/upload') },
                            { label: 'Explore Logic Repository', action: () => navigate('/projects') },
                            { label: 'System Health Status', action: () => { } },
                        ].map((btn, i) => (
                            <button
                                key={i}
                                onClick={btn.action}
                                className="w-full text-left flex items-center justify-between px-3 py-2 rounded border border-transparent hover:border-[#2e2e2e] hover:bg-[#1a1a1a] transition-all group"
                            >
                                <span className="text-xs text-zinc-400 group-hover:text-zinc-200">{btn.label}</span>
                                <ExternalLink size={10} className="text-zinc-600 group-hover:text-primary opacity-0 group-hover:opacity-100" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
