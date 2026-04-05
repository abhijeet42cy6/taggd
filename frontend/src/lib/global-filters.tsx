import React, { createContext, useContext, useMemo, useState } from "react";

type DomainFilter = "Hiring" | "Finance" | "SLA" | "WFM";

type GlobalFilterState = {
  dateRange: string;
  selectedClients: string[];
  domains: DomainFilter[];
  qualityStatus: "Good" | "Warning" | "Critical";
  search: string;
  setDateRange: (v: string) => void;
  setSelectedClients: (v: string[]) => void;
  setDomains: (v: DomainFilter[]) => void;
  setQualityStatus: (v: "Good" | "Warning" | "Critical") => void;
  setSearch: (v: string) => void;
};

const GlobalFiltersContext = createContext<GlobalFilterState | null>(null);

export function GlobalFiltersProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState("FY");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [domains, setDomains] = useState<DomainFilter[]>(["Hiring", "Finance", "SLA", "WFM"]);
  const [qualityStatus, setQualityStatus] = useState<"Good" | "Warning" | "Critical">("Good");
  const [search, setSearch] = useState("");

  const value = useMemo(
    () => ({
      dateRange,
      selectedClients,
      domains,
      qualityStatus,
      search,
      setDateRange,
      setSelectedClients,
      setDomains,
      setQualityStatus,
      setSearch,
    }),
    [dateRange, selectedClients, domains, qualityStatus, search]
  );

  return <GlobalFiltersContext.Provider value={value}>{children}</GlobalFiltersContext.Provider>;
}

export function useGlobalFilters() {
  const ctx = useContext(GlobalFiltersContext);
  if (!ctx) throw new Error("useGlobalFilters must be used in GlobalFiltersProvider");
  return ctx;
}

