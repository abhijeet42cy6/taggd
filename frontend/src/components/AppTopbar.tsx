import React from "react";
import { Bell, HelpCircle, Search } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useGlobalFilters } from "@/lib/global-filters";
import { cn } from "@/lib/utils";

const domainOptions = ["Hiring", "Finance", "SLA", "WFM"] as const;

export function AppTopbar() {
  const { dateRange, setDateRange, domains, setDomains, qualityStatus, search, setSearch } = useGlobalFilters();

  const toggleDomain = (domain: (typeof domainOptions)[number]) => {
    setDomains(domains.includes(domain) ? domains.filter((d) => d !== domain) : [...domains, domain]);
  };

  return (
    <header className="h-14 border-b border-border/50 flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-40 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors" />
        <Separator orientation="vertical" className="h-4" />
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="h-8 px-2 rounded-md bg-muted/30 border border-border/50 text-[11px] font-semibold"
        >
          <option value="Month">Month</option>
          <option value="Quarter">Quarter</option>
          <option value="FY">FY</option>
        </select>
        <div className="hidden md:flex items-center gap-1">
          {domainOptions.map((d) => (
            <button
              key={d}
              onClick={() => toggleDomain(d)}
              className={cn(
                "h-7 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                domains.includes(d)
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/20 text-muted-foreground border-border/40"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-xs group hidden sm:block">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={12} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="text"
          placeholder="Search client/project/req..."
          className="w-full bg-muted/30 border border-border/50 rounded-md py-1.5 pl-8 pr-4 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "hidden md:flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider border",
            qualityStatus === "Good" && "text-green-400 border-green-500/30 bg-green-500/10",
            qualityStatus === "Warning" && "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
            qualityStatus === "Critical" && "text-red-400 border-red-500/30 bg-red-500/10"
          )}
        >
          {qualityStatus}
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted">
          <Bell size={14} />
        </button>
        <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted">
          <HelpCircle size={14} />
        </button>
      </div>
    </header>
  );
}

