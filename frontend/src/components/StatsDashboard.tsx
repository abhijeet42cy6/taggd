import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

interface StatsDashboardProps {
    data: any[];
    title: string;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ data, title }) => {
    return (
        <Card className="bg-muted/30 border-border/50 h-full">
            <CardHeader className="pb-4">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="name"
                                type="category"
                                stroke="#888"
                                fontSize={9}
                                tickLine={false}
                                axisLine={false}
                                width={80}
                                className="font-medium uppercase tracking-tighter"
                            />
                            <Tooltip
                                cursor={{ fill: '#ffffff02' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-background/95 backdrop-blur-sm p-2 border border-border/50 rounded shadow-xl text-[10px]">
                                                <p className="font-bold mb-1 opacity-70 uppercase tracking-widest">{payload[0].payload.name}</p>
                                                <p className="text-primary font-mono">{formatCurrency(payload[0].value as number)}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="revenue" radius={[0, 2, 2, 0]} barSize={12}>
                                {data.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={`hsl(var(--primary) / ${0.9 - (index * 0.1)})`} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};
