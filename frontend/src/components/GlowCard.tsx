import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface GlowCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ReactNode;
    className?: string;
}

export const GlowCard: React.FC<GlowCardProps> = ({ title, value, subtitle, icon, className }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                "sb-bg-dark sb-border p-4 rounded-lg flex flex-col justify-between hover:border-primary/40 transition-all duration-300",
                className
            )}
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{title}</span>
                {icon && <div className="text-zinc-600 group-hover:text-primary transition-colors">{icon}</div>}
            </div>
            <div>
                <h2 className="text-xl font-bold text-zinc-100 tracking-tight">{value}</h2>
                {subtitle && <p className="text-zinc-600 text-[10px] mt-0.5 font-medium">{subtitle}</p>}
            </div>
        </motion.div>
    );
};
