import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Cpu, Code, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnMappingDisplay } from "@/components/ColumnMappingDisplay";
import { columnMappingEntryCount } from "@/lib/api";

interface AgentConsoleProps {
    logs: string[];
    /** Express/Pro upload `mapping` (v2 or legacy). */
    mapping?: Record<string, unknown> | Record<string, string> | null;
    explanation?: string;
    pythonCode?: string;
}

export const AgentConsole: React.FC<AgentConsoleProps> = ({ logs, mapping, explanation, pythonCode }) => {
    const mapCount = columnMappingEntryCount(mapping ?? undefined);
    const [showLogic, setShowLogic] = useState(false);

    return (
        <Card className="bg-muted/30 border-border/50 font-mono text-[11px] overflow-hidden">
            <CardHeader className="bg-muted/50 px-4 py-2 flex flex-row items-center justify-between border-b border-border/50">
                <div className="flex items-center gap-2 flex-wrap">
                    <Terminal size={14} className="text-primary" />
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Agent Reasoning Console</CardTitle>
                    {mapCount > 0 && (
                        <Badge variant="secondary" className="h-5 text-[8px] font-mono">
                            {mapCount} column links
                        </Badge>
                    )}
                </div>
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-destructive/30" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/30" />
                    <div className="w-2 h-2 rounded-full bg-green-500/30" />
                </div>
            </CardHeader>

            <CardContent className="p-4 max-h-[min(85vh,720px)] overflow-y-auto space-y-2 bg-black/20">
                <AnimatePresence initial={false}>
                    {logs.map((log, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex gap-3 leading-relaxed border-l border-border/10 pl-3 ml-1"
                        >
                            <span className="text-muted-foreground/30 shrink-0 font-bold w-4 text-right select-none">{i + 1}</span>
                            <span className={cn(
                                "break-all tracking-tight",
                                log.startsWith('✅') ? 'text-primary' :
                                    log.startsWith('❌') ? 'text-destructive/80' : 'text-foreground/70'
                             )}>
                                {log}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {mapCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 pt-4 border-t border-border/20"
                    >
                        <ColumnMappingDisplay mapping={mapping} variant="card" scrollMaxClass="max-h-[380px]" />
                    </motion.div>
                )}

                {explanation && (
                    <div className="mt-6 pt-4 border-t border-border/20 space-y-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowLogic(!showLogic)}
                            className="h-7 w-full flex items-center justify-between text-primary/80 hover:text-primary hover:bg-primary/5 px-2 transition-all"
                        >
                            <div className="flex items-center gap-2">
                                <Cpu size={12} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Revenue Logic Engine</span>
                            </div>
                            {showLogic ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </Button>

                        <AnimatePresence>
                            {showLogic && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden space-y-3"
                                >
                                    <div className="bg-muted/20 rounded p-3 border border-border/10">
                                        <p className="text-muted-foreground leading-relaxed italic text-[11px]">
                                            "{explanation}"
                                        </p>
                                    </div>
                                    {pythonCode && (
                                        <div className="bg-black/40 rounded border border-border/20 p-3 relative group">
                                            <div className="absolute top-2 right-2">
                                                <Code size={11} className="text-muted-foreground/30 group-hover:text-primary/40 transition-colors" />
                                            </div>
                                            <pre className="text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap font-mono leading-tight">
                                                {pythonCode}
                                            </pre>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
