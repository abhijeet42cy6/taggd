import React, { useState, useMemo, useEffect } from 'react';
import {
    Search, X, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown,
    Calendar, MapPin, Tag, SlidersHorizontal, Filter,
    ChevronLeft, ChevronRight, Info
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface RecordTableProps {
    records: any[];
}

const STATUS_OPTIONS = ['All', 'Joined', 'Offered', 'In Progress', 'Hold', 'Rejected', 'Closed'];

/* ─────────────────────────────────────────────
   Row Detail Modal
 ───────────────────────────────────────────── */
function RecordDetailModal({ record, open, onOpenChange }: { record: any; open: boolean; onOpenChange: (open: boolean) => void }) {
    if (!record) return null;

    const universalFields: Record<string, any> = {
        'Candidate Name': record.candidate_name,
        'Position Title': record.position_title,
        'Status': record.status,
        'Department': record.department,
        'Location': record.location,
        'Hiring Manager': record.hiring_manager,
        'Offered CTC': record.offered_ctc ? formatCurrency(record.offered_ctc) : null,
        'Joining Date': record.joining_date ? new Date(record.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null,
    };

    const revenueFields = record.revenue_results || {};
    const additionalFields = record.additional_attributes || {};

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-background border-border shadow-2xl overflow-hidden p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b border-border/50 bg-muted/20">
                    <DialogTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                        <Info size={14} className="text-primary" />
                        Record Intelligence
                    </DialogTitle>
                    <DialogDescription className="text-[10px] font-mono opacity-60">ID: {record.id}</DialogDescription>
                </DialogHeader>

                <div className="max-h-[70vh] overflow-y-auto">
                    {/* Revenue Banner */}
                    {revenueFields.revenue !== undefined && (
                        <div className="px-6 py-6 border-b border-border/30 bg-primary/5 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <p className="text-[9px] uppercase tracking-widest font-black text-muted-foreground/60">Attributed Yield</p>
                                <p className="text-2xl font-bold text-primary tracking-tight">{formatCurrency(revenueFields.revenue || 0)}</p>
                            </div>
                            {revenueFields.opening_fee != null && (
                                <div className="space-y-1">
                                    <p className="text-[9px] uppercase tracking-widest font-black text-muted-foreground/60">Opening Fee</p>
                                    <p className="text-lg font-bold text-foreground/80">{formatCurrency(revenueFields.opening_fee)}</p>
                                </div>
                            )}
                            {revenueFields.closing_fee != null && (
                                <div className="space-y-1">
                                    <p className="text-[9px] uppercase tracking-widest font-black text-muted-foreground/60">Closing Fee</p>
                                    <p className="text-lg font-bold text-foreground/80">{formatCurrency(revenueFields.closing_fee)}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Universal Fields */}
                    <div className="px-6 py-5 border-b border-border/20">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-4">Core Attributes</h4>
                        <div className="grid grid-cols-2 gap-y-5 gap-x-12">
                            {Object.entries(universalFields)
                                .filter(([, v]) => v != null)
                                .map(([label, value]) => (
                                    <div key={label} className="space-y-1">
                                        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-bold block">{label}</span>
                                        <div className="text-[11px] text-foreground font-semibold tracking-tight">{String(value)}</div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Additional Attributes */}
                    {Object.keys(additionalFields).length > 0 && (
                        <div className="px-6 py-5 border-b border-border/20">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-4">Extended Metadata</h4>
                            <div className="grid grid-cols-2 gap-y-5 gap-x-12">
                                {Object.entries(additionalFields)
                                    .filter(([, v]) => v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'nan')
                                    .map(([key, value]) => (
                                        <div key={key} className="space-y-1">
                                            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-bold truncate block">{key}</span>
                                            <div className="text-[11px] text-muted-foreground font-medium truncate">{String(value)}</div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ─────────────────────────────────────────────
   Main Component
 ───────────────────────────────────────────── */
export const RecordTable: React.FC<RecordTableProps> = ({ records }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [locationFilter, setLocationFilter] = useState('All');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const [sortField, setSortField] = useState('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const [currentPage, setCurrentPage] = useState(1);
    const ROWS_PER_PAGE = 250;

    const uniqueLocations = useMemo(() => {
        const locs = [...new Set(
            records.map(r => r.location).filter(l => l && l !== 'None' && l.trim() !== '' && l.toLowerCase() !== 'none')
        )].sort();
        return ['All', ...locs];
    }, [records]);

    const filtered = useMemo(() => {
        let result = records.filter(r => {
            const q = searchTerm.toLowerCase();
            const matchSearch = !q || [r.candidate_name, r.position_title, r.hiring_manager, r.department]
                .some(f => (f || '').toLowerCase().includes(q));

            const matchStatus = statusFilter === 'All' || (r.status || '').toLowerCase().includes(statusFilter.toLowerCase());
            const matchLocation = locationFilter === 'All' || (r.location || '').toLowerCase() === locationFilter.toLowerCase();

            let matchDate = true;
            if ((dateFrom || dateTo) && r.joining_date) {
                const jd = new Date(r.joining_date);
                if (dateFrom && jd < new Date(dateFrom)) matchDate = false;
                if (dateTo && jd > new Date(dateTo + 'T23:59:59')) matchDate = false;
            } else if ((dateFrom || dateTo) && !r.joining_date) {
                matchDate = false;
            }

            return matchSearch && matchStatus && matchLocation && matchDate;
        });

        if (sortField) {
            result = [...result].sort((a, b) => {
                let va = sortField === 'revenue' ? (a.revenue_results?.revenue ?? 0) : a[sortField];
                let vb = sortField === 'revenue' ? (b.revenue_results?.revenue ?? 0) : b[sortField];
                if (va == null) return 1;
                if (vb == null) return -1;
                if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
                return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }
        return result;
    }, [records, searchTerm, statusFilter, locationFilter, dateFrom, dateTo, sortField, sortDir]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, locationFilter, dateFrom, dateTo, sortField, sortDir]);

    const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * ROWS_PER_PAGE;
        return filtered.slice(start, start + ROWS_PER_PAGE);
    }, [filtered, currentPage]);

    const handleSort = (field: string) => {
        setSortDir(sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc');
        setSortField(field);
    };

    const hasActiveFilters = searchTerm || statusFilter !== 'All' || locationFilter !== 'All' || dateFrom || dateTo;

    const clearAll = () => {
        setSearchTerm('');
        setStatusFilter('All');
        setLocationFilter('All');
        setDateFrom('');
        setDateTo('');
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortField !== field) return <ArrowUpDown size={9} className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity" />;
        return sortDir === 'asc'
            ? <ArrowUp size={9} className="text-primary" />
            : <ArrowDown size={9} className="text-primary" />;
    };

    const columns = [
        { key: '#', label: '#', sortable: false },
        { key: 'candidate_name', label: 'Candidate', sortable: true },
        { key: 'position_title', label: 'Position', sortable: true },
        { key: 'department', label: 'Dept', sortable: true },
        { key: 'location', label: 'Location', sortable: true },
        { key: 'hiring_manager', label: 'Manager', sortable: true },
        { key: 'offered_ctc', label: 'CTC', sortable: true },
        { key: 'joining_date', label: 'Join Date', sortable: true },
        { key: 'status', label: 'Status', sortable: true },
        { key: 'revenue', label: 'Revenue', sortable: true },
    ];

    return (
        <div className="space-y-4">
            {/* ── Filter Panel ── */}
            <div className="bg-muted/30 border border-border/50 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal size={13} className="text-muted-foreground/60" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Ledger Filters</span>
                    </div>
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAll}
                            className="h-6 px-2 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
                        >
                            Reset System
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[280px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={13} />
                        <input
                            type="text"
                            placeholder="Search by intelligence fields..."
                            className="w-full bg-background border border-border/50 rounded h-9 pl-9 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground font-medium placeholder:text-muted-foreground/30"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-2">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[140px] h-9 text-[11px] font-bold uppercase tracking-wider bg-background border-border/50">
                                <Tag size={12} className="mr-2 text-muted-foreground opacity-50" />
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_OPTIONS.map(opt => (
                                    <SelectItem key={opt} value={opt} className="text-[11px] font-medium uppercase tracking-wider">{opt}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                            <SelectTrigger className="w-[160px] h-9 text-[11px] font-bold uppercase tracking-wider bg-background border-border/50">
                                <MapPin size={12} className="mr-2 text-muted-foreground opacity-50" />
                                <SelectValue placeholder="Location" />
                            </SelectTrigger>
                            <SelectContent>
                                {uniqueLocations.map(opt => (
                                    <SelectItem key={opt} value={opt} className="text-[11px] font-medium uppercase tracking-wider">{opt}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Separator className="opacity-30" />

                <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Calendar size={13} className={cn("shrink-0", (dateFrom || dateTo) ? 'text-primary' : 'text-muted-foreground/40')} />
                            <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest whitespace-nowrap">Join Date Bridge:</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className={cn(
                                    "bg-background border rounded h-7 px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors uppercase font-bold",
                                    dateFrom ? 'border-primary/40' : 'border-border/50'
                                )}
                            />
                            <span className="text-[9px] font-black text-muted-foreground opacity-30 mx-1">TO</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className={cn(
                                    "bg-background border rounded h-7 px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors uppercase font-bold",
                                    dateTo ? 'border-primary/40' : 'border-border/50'
                                )}
                            />
                        </div>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/40 italic">
                        SYSTEM_FILTER: {filtered.length} / {records.length} VALID_RECORDS
                    </span>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-muted/30 border border-border/50 rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-auto max-h-[600px]">
                    <Table className="whitespace-nowrap">
                        <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10 border-b border-border shadow-sm">
                            <TableRow className="hover:bg-transparent">
                                {columns.map(col => (
                                    <TableHead
                                        key={col.key}
                                        onClick={() => col.sortable && handleSort(col.key)}
                                        className={cn(
                                            'h-10 px-4 text-[10px] font-black uppercase tracking-tighter text-muted-foreground/70 select-none group border-r border-border/10 last:border-0',
                                            col.sortable && 'cursor-pointer hover:text-foreground transition-colors'
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            {col.label}
                                            {col.sortable && <SortIcon field={col.key} />}
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedRecords.map((record, i) => {
                                const globalIndex = (currentPage - 1) * ROWS_PER_PAGE + i + 1;
                                return (
                                    <TableRow
                                        key={record.id || i}
                                        className="hover:bg-muted/50 cursor-pointer group transition-colors border-b border-border/50"
                                        onClick={() => setSelectedRecord(record)}
                                    >
                                        <TableCell className="px-4 py-2 text-muted-foreground/30 font-mono text-[9px] border-r border-border/5">{globalIndex}</TableCell>
                                        <TableCell className="px-4 py-2">
                                            <div className="font-bold text-foreground text-[11px] group-hover:text-primary transition-colors tracking-tight">
                                                {record.candidate_name || <span className="italic opacity-20">UNNAMED</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-[11px] text-muted-foreground/70 font-medium">
                                            <div className="truncate max-w-[200px]">{record.position_title || '—'}</div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-[10px] text-muted-foreground/50 font-bold uppercase tracking-tight">{record.department || '—'}</TableCell>
                                        <TableCell className="px-4 py-2 text-[10px] text-muted-foreground/50 font-bold uppercase tracking-tight">{record.location || '—'}</TableCell>
                                        <TableCell className="px-4 py-2 text-[11px] text-muted-foreground/70 font-medium">
                                            <div className="truncate max-w-[150px]">{record.hiring_manager || '—'}</div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-[11px] text-foreground font-mono font-bold">
                                            {record.offered_ctc ? `₹${Number(record.offered_ctc).toLocaleString('en-IN')}` : '—'}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-[10px] text-muted-foreground font-mono font-bold uppercase">
                                            {record.joining_date
                                                ? new Date(record.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant="outline" className={cn(
                                                'text-[8px] font-black uppercase tracking-tighter h-5 px-2 border-0',
                                                (record.status || '').toLowerCase().includes('joined')
                                                    ? 'bg-green-500/10 text-green-500'
                                                    : (record.status || '').toLowerCase().includes('offered')
                                                        ? 'bg-blue-500/10 text-blue-500'
                                                        : (record.status || '').toLowerCase().includes('hold')
                                                            ? 'bg-yellow-500/10 text-yellow-500'
                                                            : 'bg-muted text-muted-foreground/60'
                                            )}>
                                                {record.status || '—'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <div className="text-[11px] text-primary font-black tracking-tight">
                                                {formatCurrency(record.revenue_results?.revenue || 0)}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                    {filtered.length === 0 && (
                        <div className="py-24 text-center text-muted-foreground/40 text-[10px] font-mono tracking-widest uppercase italic">
                            No ledger matches for active neural filters
                        </div>
                    )}
                </div>

                {/* Pagination Footer */}
                {totalPages > 1 && (
                    <div className="bg-muted/50 border-t border-border/50 px-6 py-3 flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground/50 font-mono font-bold uppercase tracking-widest">
                            INDEX: {(currentPage - 1) * ROWS_PER_PAGE + 1} TO {Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} / {filtered.length} RECORDS
                        </span>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-20"
                            >
                                <ChevronLeft size={16} />
                            </Button>
                            <span className="text-[10px] text-foreground font-bold font-mono tracking-widest">
                                PAGE {currentPage} / {totalPages}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-20"
                            >
                                <ChevronRight size={16} />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <RecordDetailModal
                record={selectedRecord}
                open={!!selectedRecord}
                onOpenChange={(open) => !open && setSelectedRecord(null)}
            />
        </div>
    );
};
