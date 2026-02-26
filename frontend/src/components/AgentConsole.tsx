import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Cpu, Database, Code, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface AgentConsoleProps {
    logs: string[];
    mapping?: Record<string, string>;
    explanation?: string;
    pythonCode?: string;
}

export const AgentConsole: React.FC<AgentConsoleProps> = ({ logs, mapping, explanation, pythonCode }) => {
    const [showLogic, setShowLogic] = useState(false);

    return (
        <div className="sb-bg-dark rounded-lg overflow-hidden sb-border font-mono text-[11px]">
            <div className="bg-[#1c1c1c] px-3 py-1.5 flex items-center justify-between border-b border-[#2e2e2e]">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-primary" />
                    <span className="font-medium text-muted-foreground uppercase tracking-widest">Agent Reasoning</span>
                </div>
                <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/20" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/20" />
                    <div className="w-2 h-2 rounded-full bg-green-500/20" />
                </div>
            </div>

            <div className="p-3 max-h-[400px] overflow-y-auto space-y-1.5 bg-black/40">
                <AnimatePresence>
                    {logs.map((log, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex gap-2 leading-relaxed"
                        >
                            <span className="text-muted-foreground shrink-0 opacity-50">{i + 1}</span>
                            <span className={cn(
                                "break-all",
                                log.startsWith('✅') ? 'text-primary' :
                                    log.startsWith('❌') ? 'text-red-400' : 'text-zinc-400'
                            )}>
                                {log}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {mapping && Object.keys(mapping).length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 pt-3 border-t border-[#2e2e2e] space-y-2"
                    >
                        <div className="flex items-center gap-2 text-primary/80">
                            <Database size={12} />
                            <span className="uppercase font-bold tracking-tighter">Column Synchronization</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-500">
                            {Object.entries(mapping).map(([uKey, target]) => (
                                <div key={uKey} className="flex justify-between border-b border-[#2e2e2e]/50 pb-0.5">
                                    <span className="text-zinc-400">{uKey}</span>
                                    <span className="text-primary/60 italic">{target}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {explanation && (
                    <div className="mt-4 pt-3 border-t border-[#2e2e2e] space-y-2">
                        <button
                            onClick={() => setShowLogic(!showLogic)}
                            className="flex items-center justify-between w-full text-primary/80 hover:text-primary transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Cpu size={12} />
                                <span className="uppercase font-bold tracking-tighter">Derived Revenue Logic</span>
                            </div>
                            {showLogic ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        <AnimatePresence>
                            {showLogic && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <p className="text-zinc-500 leading-normal italic mb-3 pr-2">
                                        "{explanation}"
                                    </p>
                                    {pythonCode && (
                                        <div className="bg-black/60 rounded border border-[#2e2e2e] p-2 relative">
                                            <div className="absolute top-0 right-0 p-1">
                                                <Code size={10} className="text-zinc-600" />
                                            </div>
                                            <pre className="text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                                                {pythonCode}
                                            </pre>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
};
