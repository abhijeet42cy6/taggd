import React, { useMemo } from 'react';
import { EChartsCanvas } from '@/components/charts/EChartsCanvas';
import { buildHorizontalRankingBarOption } from '@/components/charts/optionBuilders';
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
    const option = useMemo(() => {
        if (!data.length) return null;
        return buildHorizontalRankingBarOption(
            data.map((d) => d.name),
            data.map((d) => d.revenue),
            data.map((_, index) => `hsl(var(--primary) / ${0.9 - index * 0.1})`)
        );
    }, [data]);

    return (
        <Card className="bg-muted/30 border-border/50 h-full">
            <CardHeader className="pb-4">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <EChartsCanvas option={option} height={250} emptyMessage="No data" />
            </CardContent>
        </Card>
    );
};
