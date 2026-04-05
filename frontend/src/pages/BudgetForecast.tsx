import React, { useState, useEffect } from 'react';
import {
    TrendingUp,
    BarChart3,
    Target,
    Table as TableIcon,
    PieChart,
    Edit2,
    Save,
    X,
    Zap,
    Download,
    RefreshCcw,
    Lock,
    Unlock,
} from 'lucide-react';
import { formatCurrency, formatLargeCurrency, cn } from '@/lib/utils';

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { api, invalidateCache, queries } from "@/lib/api";

/** FastAPI mounts these under `/api/...`; browser must call `/api/api/...` so nginx/Vite strip one `/api` → `/api/...` on the server. */
const BF = {
  upload: "/api/upload/budget-forecast",
  recalculate: "/api/budget-forecast/recalculate",
  putBudget: (projectId: number) => `/api/budget/${projectId}`,
} as const;

export const BudgetForecast = () => {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [data, setData] = useState<any>(null);
    const [waterfallData, setWaterfallData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Editing states
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<any>({});

    const fetchData = async () => {
        try {
            setLoading(true);
            const [d, w] = await Promise.all([
                queries.budgetForecastData(),
                queries.budgetForecastWaterfall(),
            ]);
            setData(d);
            setWaterfallData(w);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleUpload = async () => {
        if (!file) return;
        setStatus('uploading');
        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post(BF.upload, formData);
            setStatus('success');
            setMessage(`Synced`);
            invalidateCache("budget-forecast");
            fetchData();
        } catch (err: any) {
            setStatus('error');
            setMessage(err.response?.data?.detail || "Sync failed");
        }
    };

    const handleRecalculate = async () => {
        try {
            await api.post(BF.recalculate);
            invalidateCache("budget-forecast");
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveBudget = async (b: any) => {
        try {
            if (!b.project_id) {
                alert("Cannot edit budgets for unmatched clients.");
                return;
            }
            await api.put(BF.putBudget(b.project_id), editValues);
            setEditingId(null);
            invalidateCache("budget-forecast");
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };



    const forecastMonths = data?.forecasts
        ? Array.from(new Set(data.forecasts.flatMap((f: any) => Object.keys(f.months)))) as string[]
        : [] as string[];

    return (
        <div className="space-y-6">
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-[11px] text-destructive">
                Duplicate finance month-category rows can distort totals; cross-check in Data Operations and use dedupe review before final decisioning.
            </div>
            {/* Professional Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Planning Repository</h1>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium opacity-70">Institutional Grade Reconciliation</p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-muted/50 border border-border/50 px-2 py-1 rounded-md h-8">
                        <input
                            type="file"
                            id="bf-upload"
                            className="hidden"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                        <label htmlFor="bf-upload" className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors truncate max-w-[100px] px-2">
                            {file ? file.name : "Upload Book19"}
                        </label>
                        <Button
                            onClick={handleUpload}
                            disabled={!file || status === 'uploading'}
                            size="sm"
                            className="h-6 text-[9px] font-bold uppercase"
                        >
                            Sync
                        </Button>
                    </div>

                    <Button
                        onClick={handleRecalculate}
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] font-bold uppercase gap-2 border-border/50"
                    >
                        <RefreshCcw size={12} /> Recalculate
                    </Button>

                    <Button
                        onClick={() => setIsEditMode(!isEditMode)}
                        variant={isEditMode ? "destructive" : "outline"}
                        size="sm"
                        className="h-8 text-[10px] font-bold uppercase border-border/50"
                    >
                        {isEditMode ? <><Lock size={12} className="mr-2" /> Lock Vault</> : <><Unlock size={12} className="mr-2" /> Override</>}
                    </Button>
                </div>
            </div>

            <Separator className="opacity-50" />

            {/* Strategic KPI & Analytics Grid */}
            <div className="grid grid-cols-12 gap-4">
                {/* 1. Delta Performance Matrix */}
                <div className="col-span-4 grid gap-4">
                    <Card className="bg-muted/30 border-border/50 relative overflow-hidden group">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Fiscal Goal Utilization</CardDescription>
                            <CardTitle className="text-2xl font-semibold">{formatLargeCurrency(data?.summary?.total_actual)}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-[9px] font-bold px-1.5 py-0.5 rounded-sm",
                                        (data?.summary?.total_actual / data?.summary?.total_budget) >= 1 ? "bg-green-500/20 text-green-500" : "bg-primary/20 text-primary"
                                    )}>
                                        {((data?.summary?.total_actual / data?.summary?.total_budget) * 100).toFixed(0)}% Achieved
                                    </span>
                                    <span className="text-[9px] text-muted-foreground">vs Target</span>
                                </div>
                                <span className="text-[8px] text-muted-foreground/60 mt-1 italic leading-none">*Includes only nodes mapped to Fiscal Plan</span>
                            </div>
                        </CardContent>
                        <div className="absolute top-2 right-2 opacity-5 pointer-events-none">
                            <Target size={40} />
                        </div>
                    </Card>

                    <Card className="bg-muted/30 border-border/50">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Top Node Variance</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {data?.budgets?.slice(0, 2).map((b: any) => (
                                <div key={b.id} className="space-y-1">
                                    <div className="flex justify-between items-end">
                                        <p className="text-[10px] font-medium text-muted-foreground/80 uppercase truncate max-w-[150px]">{b.is_matched ? b.system_name : b.raw_name}</p>
                                        <p className="text-[10px] font-bold text-foreground">{((b.actual / b.total) * 100).toFixed(0)}%</p>
                                    </div>
                                    <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary"
                                            style={{ width: `${Math.min((b.actual / b.total) * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* 2. MoM Bridge Waterfall Analysis */}
                <Card className="col-span-8 bg-muted/30 border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-8">
                        <div>
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
                                <BarChart3 size={12} className="text-primary" />
                                MoM Revenue Bridge Analysis
                            </CardTitle>
                            <CardDescription className="text-[10px] mt-1 font-mono italic opacity-50 uppercase">Current Month Recruitment Velocity Pipeline</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between gap-6 h-[120px] px-4">
                            {(() => {
                                const allVals = [
                                    waterfallData?.opening || 0,
                                    waterfallData?.additions || 0,
                                    Math.abs(waterfallData?.closures || 0),
                                    Math.abs(waterfallData?.leakage || 0),
                                    Math.abs(waterfallData?.total || 0)
                                ];
                                const absoluteMax = Math.max(...allVals, 1);

                                return [
                                    { label: 'Forecast', val: waterfallData?.opening, color: 'bg-muted-foreground/10 border-muted-foreground/20', type: 'base' },
                                    { label: 'Additions', val: waterfallData?.additions, color: 'bg-green-500/30 border-green-500/40 text-green-500', type: 'up' },
                                    { label: 'Closures', val: -Math.abs(waterfallData?.closures || 0), color: 'bg-primary/30 border-primary/40 text-primary', type: 'down' },
                                    { label: 'Leakage', val: -Math.abs(waterfallData?.leakage || 0), color: 'bg-destructive/30 border-destructive/40 text-destructive', type: 'down' },
                                    { label: 'Net Next', val: waterfallData?.total, color: 'bg-foreground/10 border-foreground/20', type: 'total' }
                                ].map((item, i) => {
                                    const height = (Math.abs(item.val || 0) / absoluteMax) * 100;

                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                                            <div className={cn(
                                                "text-[9px] font-mono font-bold transition-all duration-300",
                                                item.val >= 0 ? 'text-green-500' : 'text-destructive'
                                            )}>
                                                {formatLargeCurrency(Math.abs(item.val || 0))}
                                            </div>
                                            <div
                                                className={cn("w-full border-t border-x rounded-t-[2px] relative transition-all duration-500 group-hover:brightness-125", item.color)}
                                                style={{ height: `${Math.min(height, 100)}%` }}
                                            >
                                                {item.type === 'up' && <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-black">+</div >}
                                                {item.type === 'down' && <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-black">-</div >}
                                            </div>
                                            <span className="text-[9px] font-black text-muted-foreground/40 truncate w-full text-center uppercase tracking-widest">{item.label}</span>
                                        </div>
                                    );
                                })})()}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Repository Navigation Tabs */}
            <Tabs defaultValue="budget" className="w-full">
                <TabsList className="bg-transparent h-auto p-0 gap-8 rounded-none border-b border-border/50 w-full justify-start overflow-x-auto no-scrollbar">
                    <TabsTrigger
                        value="budget"
                        className="rounded-none border-b-2 border-transparent px-4 py-2 text-[10px] font-bold uppercase tracking-widest data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                    >
                        Budget Repository
                    </TabsTrigger>
                    <TabsTrigger
                        value="forecast"
                        className="rounded-none border-b-2 border-transparent px-4 py-2 text-[10px] font-bold uppercase tracking-widest data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                    >
                        Forecast Repository
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="budget" className="mt-6">
                    <Card className="border-border/50">
                        <CardHeader className="py-3 px-6 border-b border-border/50 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TableIcon size={14} className="text-primary" />
                                <CardTitle className="text-[11px] font-semibold uppercase tracking-tight">Quarterly Budget Decomposition</CardTitle>
                            </div>
                            <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-widest opacity-50">Confidence Level: Institutional</span>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/10">
                                    <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="w-[200px] text-[9px] font-bold uppercase tracking-wider pl-6">Client Identity</TableHead>
                                        <TableHead className="text-center text-[9px] font-bold uppercase tracking-wider">State</TableHead>
                                        <TableHead className="text-right text-[9px] font-bold uppercase tracking-wider">Q1 Target</TableHead>
                                        <TableHead className="text-right text-[9px] font-bold uppercase tracking-wider">Q2 Target</TableHead>
                                        <TableHead className="text-right text-[9px] font-bold uppercase tracking-wider">Q3 Target</TableHead>
                                        <TableHead className="text-right text-[9px] font-bold uppercase tracking-wider">Q4 Target</TableHead>
                                        <TableHead className="text-right text-[9px] font-bold uppercase tracking-wider bg-muted/20">Annual Plan</TableHead>
                                        <TableHead className="text-right text-[9px] font-bold uppercase tracking-wider bg-primary/5 text-primary">Realized</TableHead>
                                        {isEditMode && <TableHead className="text-center text-[9px] font-bold uppercase tracking-wider">Action</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data?.budgets?.map((b: any) => (
                                        <TableRow key={b.id} className="border-border/50 group">
                                            <TableCell className="pl-6">
                                                <div className="flex flex-col">
                                                    <span className="text-[12px] font-medium leading-none">
                                                        {b.is_matched ? b.system_name : b.raw_name}
                                                    </span>
                                                    {b.is_matched && <span className="text-[8px] text-muted-foreground mt-1 uppercase tracking-tighter">Source: {b.raw_name}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <div className={cn("w-1 h-1 rounded-full", b.is_matched ? "bg-green-500 shadow-[0_0_8px_#10b981]" : "bg-muted-foreground/30")} />
                                                    <span className={cn("text-[9px] font-bold tracking-widest", b.is_matched ? "text-green-500" : "text-muted-foreground/40")}>
                                                        {b.is_matched ? "SYNCED" : "PLAN"}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            {editingId === `b-${b.id}` ? (
                                                <>
                                                    {['q1', 'q2', 'q3', 'q4'].map(q => (
                                                        <TableCell key={q} className="text-right py-2">
                                                            <Input
                                                                type="number"
                                                                className="h-8 w-24 ml-auto text-right text-[11px] font-mono border-primary/50"
                                                                value={editValues[q]}
                                                                onChange={e => setEditValues({ ...editValues, [q]: parseFloat(e.target.value) })}
                                                            />
                                                        </TableCell>
                                                    ))}
                                                    <TableCell className="text-right font-medium text-[11px] bg-muted/20">
                                                        {formatCurrency(editValues.q1 + editValues.q2 + editValues.q3 + editValues.q4)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-[12px] text-primary bg-primary/5">{formatCurrency(b.actual)}</TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex gap-1 justify-center">
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => handleSaveBudget(b)}><Save size={14} /></Button>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setEditingId(null)}><X size={14} /></Button>
                                                        </div>
                                                    </TableCell>
                                                </>
                                            ) : (
                                                <>
                                                    <TableCell className="text-right text-[11px] font-mono text-muted-foreground/70">{formatCurrency(b.q1)}</TableCell>
                                                    <TableCell className="text-right text-[11px] font-mono text-muted-foreground/70">{formatCurrency(b.q2)}</TableCell>
                                                    <TableCell className="text-right text-[11px] font-mono text-muted-foreground/70">{formatCurrency(b.q3)}</TableCell>
                                                    <TableCell className="text-right text-[11px] font-mono text-muted-foreground/70">{formatCurrency(b.q4)}</TableCell>
                                                    <TableCell className="text-right font-medium text-[11px] bg-muted/20">{formatCurrency(b.total)}</TableCell>
                                                    <TableCell className="text-right font-bold text-[12px] text-primary bg-primary/5">{formatCurrency(b.actual)}</TableCell>
                                                    {isEditMode && (
                                                        <TableCell className="text-center">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                onClick={() => {
                                                                    setEditingId(`b-${b.id}`);
                                                                    setEditValues({ q1: b.q1, q2: b.q2, q3: b.q3, q4: b.q4 });
                                                                }}
                                                            >
                                                                <Edit2 size={12} />
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                </>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="forecast" className="mt-6">
                    <Card className="border-border/50">
                        <CardHeader className="py-3 px-6 border-b border-border/50">
                            <div className="flex items-center gap-2">
                                <PieChart size={14} className="text-primary" />
                                <CardTitle className="text-[11px] font-semibold uppercase tracking-tight">Month-on-Month Projection Matrix</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <Table className="min-w-[1400px]">
                                <TableHeader className="bg-muted/10">
                                    <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="w-[200px] text-[9px] font-bold uppercase tracking-wider sticky left-0 bg-background/50 backdrop-blur z-20 pl-6">Identity / Vector</TableHead>
                                        {forecastMonths.map(m => (
                                            <TableHead key={m} className="text-center text-[9px] font-bold uppercase tracking-wider">{m}</TableHead>
                                        ))}
                                        {isEditMode && <TableHead className="text-center text-[9px] font-bold uppercase tracking-wider">Edit</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data?.forecasts?.map((f: any) => (
                                        <React.Fragment key={f.raw_name}>
                                            {['MMF', 'Joiner', 'Joining Fee'].map((metric, idx) => (
                                                <TableRow key={metric} className={cn("border-border/50 hover:bg-muted/5", idx === 2 && "border-b-2 border-border/30")}>
                                                    <TableCell className="sticky left-0 bg-background/50 backdrop-blur z-10 pl-6 py-2">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {idx === 0 ? (
                                                                    <>
                                                                        <div className={cn("w-1 h-1 rounded-full shrink-0", f.is_matched ? "bg-green-500" : "bg-muted-foreground/30")} />
                                                                        <span className="text-[11px] font-semibold truncate leading-none">
                                                                            {f.is_matched ? f.system_name : f.raw_name}
                                                                        </span>
                                                                    </>
                                                                ) : <div className="w-4 h-1 shrink-0" />}
                                                            </div>
                                                            <span className={cn(
                                                                "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-[2px] tracking-widest shrink-0",
                                                                metric === 'Joiner' ? "bg-primary/20 text-primary border border-primary/20" : "bg-muted/50 text-muted-foreground/70"
                                                            )}>{metric === 'Joining Fee' ? 'Fees' : metric}</span>
                                                        </div>
                                                    </TableCell>
                                                    {forecastMonths.map(m => (
                                                        <TableCell key={m} className="text-center py-2">
                                                            <span className={cn(
                                                                "text-[10px] font-mono",
                                                                metric === 'Joiner' ? "font-bold text-foreground" : "text-muted-foreground/60"
                                                            )}>
                                                                {metric === 'Joiner' ? f.months[m]?.[metric] || 0 : formatCurrency(f.months[m]?.[metric] || 0)}
                                                            </span>
                                                        </TableCell>
                                                    ))}
                                                    {idx === 0 && isEditMode && (
                                                        <TableCell className="text-center" rowSpan={3}>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7"
                                                                onClick={() => alert("Bulk override available in roadmap.")}
                                                            >
                                                                <Edit2 size={12} />
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};
