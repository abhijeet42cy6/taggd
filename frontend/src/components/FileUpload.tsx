import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

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
                "glass border-2 border-dashed rounded-3xl p-10 transition-all duration-300 cursor-pointer group",
                isDragActive ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40",
                status === 'uploading' || status === 'processing' ? "pointer-events-none opacity-80" : ""
            )}
        >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center text-center gap-4">
                <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-500",
                    isDragActive ? "scale-110 bg-primary/20" : "bg-secondary group-hover:bg-primary/10"
                )}>
                    {status === 'processing' || status === 'uploading' ? (
                        <Loader2 className="animate-spin text-primary" size={32} />
                    ) : status === 'success' ? (
                        <CheckCircle className="text-green-500" size={32} />
                    ) : (
                        <Upload className="text-muted-foreground group-hover:text-primary transition-colors" size={32} />
                    )}
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {status === 'processing' ? 'Agent is Thinking...' :
                            status === 'uploading' ? 'Uploading...' :
                                status === 'success' ? 'Processing Complete!' :
                                    'Upload Tracker'}
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                        Drag and drop your Excel (.xlsx) position tracker here.
                    </p>
                </div>

                {status === 'processing' && (
                    <div className="w-full max-w-xs h-1 bg-secondary rounded-full overflow-hidden mt-4">
                        <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 10, ease: "easeInOut" }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
