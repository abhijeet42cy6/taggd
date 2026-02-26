import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency } from '../lib/utils';

interface StatsDashboardProps {
    data: any[];
    title: string;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ data, title }) => {
    return (
        <div className="glass p-6 rounded-2xl border-border/40 h-full">
            <h3 className="text-lg font-semibold mb-6">{title}</h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            stroke="#888"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            width={100}
                        />
                        <Tooltip
                            cursor={{ fill: '#ffffff05' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="glass p-3 rounded-lg border-border/50 text-xs">
                                            <p className="font-bold mb-1">{payload[0].payload.name}</p>
                                            <p className="text-primary">{formatCurrency(payload[0].value as number)}</p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={20}>
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={`hsl(263, 70%, ${60 - index * 4}%)`} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
