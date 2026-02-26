import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Search, X, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown,
    Calendar, MapPin, Tag, SlidersHorizontal, Filter,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface RecordTableProps {
    records: any[];
}

const STATUS_OPTIONS = ['All', 'Joined', 'Offered', 'In Progress', 'Hold', 'Rejected', 'Closed'];

/* ─────────────────────────────────────────────
   Row Detail Modal
───────────────────────────────────────────── */
function RecordDetailModal({ record, onClose }: { record: any; onClose: () => void }) {
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
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.96, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="bg-[#171717] border border-[#2e2e2e] rounded-xl w-full max-w-2xl max-h-[82vh] overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2e2e2e] shrink-0">
                    <div>
                        <h3 className="font-bold text-sm text-zinc-100 leading-tight">
                            {record.candidate_name || record.position_title || 'Row Details'}
                        </h3>
                        <p className="text-[9px] text-zinc-600 font-mono mt-0.5">record #{record.id}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-[#2a2a2a] rounded-md text-zinc-500 hover:text-zinc-200 transition-colors">
                        <X size={15} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1">
                    {/* Revenue Banner */}
                    {revenueFields.revenue !== undefined && (
                        <div className="px-5 py-4 border-b border-[#2e2e2e] bg-primary/5 flex flex-wrap gap-6">
                            <div>
                                <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-500">Attributed Revenue</p>
                                <p className="text-2xl font-bold text-primary mt-0.5">{formatCurrency(revenueFields.revenue || 0)}</p>
                            </div>
                            {revenueFields.opening_fee != null && (
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-500">Opening Fee</p>
                                    <p className="text-base font-bold text-zinc-300 mt-0.5">{formatCurrency(revenueFields.opening_fee)}</p>
                                </div>
                            )}
                            {revenueFields.closing_fee != null && (
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-500">Closing Fee</p>
                                    <p className="text-base font-bold text-zinc-300 mt-0.5">{formatCurrency(revenueFields.closing_fee)}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Universal Fields */}
                    <div className="px-5 py-4 border-b border-[#2e2e2e]">
                        <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-600 mb-3">Core Fields</p>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-10">
                            {Object.entries(universalFields)
                                .filter(([, v]) => v != null)
                                .map(([label, value]) => (
                                    <div key={label}>
                                        <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold">{label}</span>
                                        <div className="text-[11px] text-zinc-300 font-medium mt-0.5">{String(value)}</div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Additional Attributes */}
                    {Object.keys(additionalFields).length > 0 && (
                        <div className="px-5 py-4">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-600 mb-3">Extended Fields</p>
                            <div className="grid grid-cols-2 gap-y-3 gap-x-10">
                                {Object.entries(additionalFields)
                                    .filter(([, v]) => v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'nan')
                                    .map(([key, value]) => (
                                        <div key={key}>
                                            <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold truncate block">{key}</span>
                                            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{String(value)}</div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

/* ─────────────────────────────────────────────
   Filter Panel
───────────────────────────────────────────── */
function Dropdown({
    label, icon: Icon, value, options, onChange,
}: {
    label: string;
    icon: React.ElementType;
    value: string;
    options: string[];
    onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const isActive = value !== 'All';

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] font-bold transition-all',
                    isActive
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-[#1a1a1a] border-[#2e2e2e] text-zinc-400 hover:border-[#444] hover:text-zinc-200'
                )}
            >
                <Icon size={11} />
                <span>{label}: {value}</span>
                <ChevronDown size={10} className={cn('transition-transform', open && 'rotate-180')} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute top-full mt-1.5 left-0 bg-[#1c1c1c] border border-[#333] rounded-lg shadow-xl z-50 py-1 min-w-[160px] max-h-52 overflow-y-auto"
                    >
                        {options.map(opt => (
                            <button
                                key={opt}
                                onClick={() => { onChange(opt); setOpen(false); }}
                                className={cn(
                                    'w-full text-left px-3 py-1.5 text-[11px] transition-colors hover:bg-[#242424]',
                                    value === opt ? 'text-primary font-bold' : 'text-zinc-400'
                                )}
                            >
                                {opt}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
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

    // Reset pagination when filters or sorting change
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
        if (sortField !== field) return <ArrowUpDown size={9} className="text-zinc-700 group-hover:text-zinc-500 transition-colors" />;
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
        <>
            {/* ── Filter Panel ── */}
            <div className="bg-[#171717] border border-[#2e2e2e] rounded-lg p-4 mb-3 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                    <SlidersHorizontal size={13} className="text-zinc-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Filters</span>
                    {hasActiveFilters && (
                        <button
                            onClick={clearAll}
                            className="ml-auto flex items-center gap-1 text-[10px] text-zinc-500 hover:text-primary transition-colors"
                        >
                            <X size={9} /> Clear all
                        </button>
                    )}
                </div>

                {/* Row 1: Search + Dropdown Filters */}
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" size={11} />
                        <input
                            type="text"
                            placeholder="Search candidate, position, manager, dept..."
                            className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded py-1.5 pl-8 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40 font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">
                                <X size={10} />
                            </button>
                        )}
                    </div>

                    <Dropdown label="Status" icon={Tag} value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
                    <Dropdown label="Location" icon={MapPin} value={locationFilter} options={uniqueLocations} onChange={setLocationFilter} />
                </div>

                {/* Row 2: Date Range */}
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2">
                        <Calendar size={12} className={cn("shrink-0", (dateFrom || dateTo) ? 'text-primary' : 'text-zinc-600')} />
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Join Date Range:</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-zinc-600">From</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className={cn(
                                "bg-[#1a1a1a] border rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors",
                                dateFrom ? 'border-primary/40' : 'border-[#2e2e2e]'
                            )}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-zinc-600">To</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className={cn(
                                "bg-[#1a1a1a] border rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors",
                                dateTo ? 'border-primary/40' : 'border-[#2e2e2e]'
                            )}
                        />
                    </div>
                    {(dateFrom || dateTo) && (
                        <button
                            onClick={() => { setDateFrom(''); setDateTo(''); }}
                            className="text-[10px] text-zinc-600 hover:text-primary flex items-center gap-1 transition-colors"
                        >
                            <X size={9} /> Clear dates
                        </button>
                    )}
                    <span className="ml-auto text-[10px] font-mono text-zinc-600 italic">
                        {filtered.length} / {records.length} entries
                    </span>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-[#171717] border border-[#2e2e2e] rounded-lg overflow-hidden">
                <div className="overflow-auto" style={{ maxHeight: '620px' }}>
                    <table className="w-full text-[11px] whitespace-nowrap">
                        <thead className="sticky top-0 bg-[#1c1c1c] border-b border-[#2e2e2e] z-10">
                            <tr>
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        onClick={() => col.sortable && handleSort(col.key)}
                                        className={cn(
                                            'px-3 py-2 text-left font-bold uppercase tracking-tighter text-zinc-500 select-none group',
                                            col.sortable && 'cursor-pointer hover:text-zinc-300 hover:bg-[#222]'
                                        )}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {col.sortable && <SortIcon field={col.key} />}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#242424]">
                            {paginatedRecords.map((record, i) => {
                                const globalIndex = (currentPage - 1) * ROWS_PER_PAGE + i + 1;
                                return (
                                    <tr
                                        key={record.id || i}
                                        className="hover:bg-[#1f1f1f] cursor-pointer group transition-colors"
                                        onClick={() => setSelectedRecord(record)}
                                    >
                                        <td className="px-3 py-1.5 text-zinc-700 font-mono text-[9px]">{globalIndex}</td>
                                        <td className="px-3 py-1.5">
                                            <div className="font-bold text-zinc-300 group-hover:text-primary transition-colors">
                                                {record.candidate_name || <span className="italic text-zinc-700">Unnamed</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5 text-zinc-500 max-w-[170px]">
                                            <div className="truncate">{record.position_title || '—'}</div>
                                        </td>
                                        <td className="px-3 py-1.5 text-zinc-600">{record.department || '—'}</td>
                                        <td className="px-3 py-1.5 text-zinc-600">{record.location || '—'}</td>
                                        <td className="px-3 py-1.5 text-zinc-500 max-w-[130px]">
                                            <div className="truncate">{record.hiring_manager || '—'}</div>
                                        </td>
                                        <td className="px-3 py-1.5 text-zinc-400 font-mono">
                                            {record.offered_ctc ? `₹${Number(record.offered_ctc).toLocaleString('en-IN')}` : '—'}
                                        </td>
                                        <td className="px-3 py-1.5 text-zinc-500 font-mono">
                                            {record.joining_date
                                                ? new Date(record.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <span className={cn(
                                                'px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter',
                                                (record.status || '').toLowerCase().includes('joined')
                                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                                    : (record.status || '').toLowerCase().includes('offered')
                                                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                        : (record.status || '').toLowerCase().includes('hold')
                                                            ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                            )}>
                                                {record.status || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono text-primary font-bold">
                                            {formatCurrency(record.revenue_results?.revenue || 0)}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    {filtered.length === 0 && (
                        <div className="py-20 text-center text-zinc-600 text-[11px] font-mono italic">
                            No matching entries for the selected filters.
                        </div>
                    )}
                </div>

                {/* Pagination Footer */}
                {totalPages > 1 && (
                    <div className="bg-[#1c1c1c] border-t border-[#2e2e2e] px-4 py-2.5 flex items-center justify-between">
                        <span className="text-[10px] text-zinc-500 font-mono">
                            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} of {filtered.length} entries
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#2a2a2a] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-[10px] text-zinc-400 font-bold px-2">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#2a2a2a] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {selectedRecord && (
                    <RecordDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
                )}
            </AnimatePresence>
        </>
    );
};
