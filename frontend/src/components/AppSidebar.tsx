import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Radar,
    Building2,
    ClipboardList,
    Banknote,
    ShieldAlert,
    Users,
    DatabaseZap,
    UploadCloud,
    Cpu,
    Bookmark,
    Settings
} from 'lucide-react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar";

import { cn } from "@/lib/utils";

const primaryNav = [
    { icon: LayoutDashboard, label: 'Executive Overview', path: '/' },
    { icon: Radar, label: 'Portfolio Intelligence', path: '/portfolio' },
    { icon: Building2, label: 'Clients', path: '/clients' },
    { icon: ClipboardList, label: 'Requisitions', path: '/requisitions' },
    { icon: Banknote, label: 'Finance Command', path: '/finance' },
    { icon: ShieldAlert, label: 'SLA Performance', path: '/sla-performance' },
    { icon: Users, label: 'Workforce Management', path: '/wfm' },
    { icon: DatabaseZap, label: 'Data Operations', path: '/data-operations' },
    { icon: UploadCloud, label: 'Ingestion Center', path: '/ingestion' },
];

const secondaryNav = [
    { icon: Bookmark, label: 'Saved Views', path: '/saved-views' },
];

export function AppSidebar() {
    return (
        <Sidebar collapsible="icon" className="border-r border-border/50">

            <SidebarHeader className="px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                        <Cpu className="text-black" size={14} />
                    </div>
                    <span className="font-bold text-sm tracking-tight text-foreground">
                        Agentic<span className="text-primary">Rev</span>
                    </span>
                </div>
            </SidebarHeader>
            <SidebarContent className="px-2">
                <SidebarGroup>
                    <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-4">Decision Platform</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {primaryNav.map((item) => (
                                <SidebarMenuItem key={item.path}>
                                    <SidebarMenuButton asChild tooltip={item.label} className="h-9 px-4">
                                        <NavLink
                                            to={item.path}
                                            className={({ isActive }) => cn(
                                                "flex items-center gap-3 w-full transition-colors",
                                                isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <item.icon size={16} />
                                            <span className="text-sm font-medium">{item.label}</span>
                                        </NavLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>

                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                    <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-4">Workspace</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {secondaryNav.map((item) => (
                                <SidebarMenuItem key={item.path}>
                                    <SidebarMenuButton asChild tooltip={item.label} className="h-9 px-4">
                                        <NavLink
                                            to={item.path}
                                            className={({ isActive }) => cn(
                                                "flex items-center gap-3 w-full transition-colors",
                                                isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <item.icon size={16} />
                                            <span className="text-sm font-medium">{item.label}</span>
                                        </NavLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-4 border-t border-border/50">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Settings" className="h-9 px-4 text-muted-foreground hover:text-foreground group w-full">
                            <Settings size={16} className="group-hover:rotate-45 transition-transform duration-500" />
                            <span className="text-sm font-medium">Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>

    );
}
