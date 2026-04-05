import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, CheckCircle, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface FileUploadProps {
    onUpload: (file: File) => void;
    status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload, status }) => {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            onUpload(acceptedFiles[0]);
        }
    }, [onUpload]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        },
        multiple: false
    });

    return (
        <div
            {...getRootProps()}
            className={cn(
                "relative overflow-hidden bg-muted/20 border-2 border-dashed rounded-xl p-12 transition-all duration-300 cursor-pointer group",
                isDragActive ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/30",
                (status === 'uploading' || status === 'processing') ? "pointer-events-none" : ""
            )}
        >
            <input {...getInputProps()} />
            
            {/* Background Neural Grid Decoraion */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none overflow-hidden">
                <div className="grid grid-cols-12 gap-1 w-full h-full">
                    {Array.from({ length: 144 }).map((_, i) => (
                        <div key={i} className="aspect-square border border-foreground rounded-[1px]" />
                    ))}
                </div>
            </div>

            <div className="relative flex flex-col items-center text-center gap-6">
                <div className={cn(
                    "w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm",
                    isDragActive ? "scale-110 bg-primary/20 ring-4 ring-primary/10" : "bg-muted shadow-inner group-hover:bg-primary/10"
                )}>
                    {status === 'processing' || status === 'uploading' ? (
                        <Loader2 className="animate-spin text-primary" size={36} />
                    ) : status === 'success' ? (
                        <div className="relative">
                            <CheckCircle className="text-green-500" size={36} />
                            <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background" 
                            />
                        </div>
                    ) : (
                        <Upload className="text-muted-foreground/60 group-hover:text-primary transition-colors" size={36} />
                    )}
                </div>

                <div className="space-y-2">
                    <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground/90">
                        {status === 'processing' ? 'Agentic Synthesis In Progress' :
                            status === 'uploading' ? 'Transmitting Data' :
                                status === 'success' ? 'Optimization Complete' :
                                    'Intelligence Gateway'}
                    </h3>
                    <div className="flex flex-col items-center">
                         <p className="text-muted-foreground text-[11px] font-medium max-w-[240px] leading-relaxed">
                            {status === 'success' 
                                ? 'Neural mapping established successfully. Results projected below.' 
                                : 'Drag and drop standard XLSM/XLSX position inventory for autonomous processing.'}
                        </p>
                        {status === 'idle' && (
                            <div className="mt-4 flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-full border border-border/50">
                                <FileText size={10} className="text-primary/60" />
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Supported: .XLSX ONLY</span>
                            </div>
                        )}
                    </div>
                </div>

                {(status === 'processing' || status === 'uploading') && (
                    <div className="w-full max-w-xs space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-[9px] font-bold text-primary uppercase tracking-widest animate-pulse">
                                {status === 'uploading' ? 'Uploading Vault' : 'Mapping Schemas'}
                            </span>
                            <Database size={12} className="text-primary/40" />
                        </div>
                        <Progress value={45} className="h-1 bg-muted shadow-none" />
                        <p className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-tighter">
                            SYS_LOAD: PRCSSING_EXTRACT_NODES
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
