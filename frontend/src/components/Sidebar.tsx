import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Home,
    Database,
    UploadCloud,
    Settings,
    FileText,
    ShieldCheck,
    Cpu
} from 'lucide-react';
import { cn } from '../lib/utils';

export const Sidebar = () => {
    const navItems = [
        { icon: Home, label: 'Dashboard', path: '/' },
        { icon: FileText, label: 'Project Vault', path: '/projects' },
        { icon: UploadCloud, label: 'Data Import', path: '/upload' },
        { icon: ShieldCheck, label: 'Audit Hub', path: '/audit' },
    ];

    return (
        <aside className="w-56 sb-bg-sidebar border-r border-[#2e2e2e] h-screen fixed left-0 top-0 flex flex-col z-50">
            <div className="flex items-center gap-2 px-6 py-5 mb-4">
                <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                    <Cpu className="text-black" size={14} />
                </div>
                <span className="font-bold text-base tracking-tight text-zinc-100">
                    Agentic<span className="text-primary">Rev</span>
                </span>
            </div>

            <nav className="flex-1 px-3 space-y-0.5">
                <p className="px-3 pb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-50">General</p>
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => cn(
                            "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all",
                            isActive
                                ? "bg-[#1f1f1f] text-primary"
                                : "text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground"
                        )}
                    >
                        <item.icon size={16} />
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            <div className="mt-auto p-4 border-t border-[#2e2e2e]">
                <div className="flex items-center gap-3 px-3 py-1.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors group">
                    <Settings size={16} className="group-hover:rotate-45 transition-transform duration-500" />
                    <span className="text-xs font-medium">Settings</span>
                </div>
            </div>
        </aside>
    );
};
