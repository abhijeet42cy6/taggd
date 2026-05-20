import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function formatDate(dateString: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatLargeCurrency(val: number): string {
    if (!val) return '₹0';
    if (val >= 10000000) {
        return `₹${(val / 10000000).toFixed(2)} Cr`;
    } else if (val >= 100000) {
        return `₹${(val / 100000).toFixed(2)} L`;
    }
    return formatCurrency(val);
}

export function formatPercent(value: number | string | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.0%";
  return `${num.toFixed(digits)}%`;
}

/** WFM lateral productivity target — workbook column is in lacs, not a percentage. */
export function formatLacs(value: number | string | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return `${(0).toFixed(digits)} lacs`;
  return `${num.toFixed(digits)} lacs`;
}

export function formatNumber(value: number | string | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return (0).toFixed(digits);
  return num.toFixed(digits);
}

