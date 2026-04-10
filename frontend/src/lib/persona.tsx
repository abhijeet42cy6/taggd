import React, { createContext, useContext, useState } from "react";

export type PersonaId = "ceo" | "finance" | "wfm" | "client_manager" | "ops";

export type PersonaDef = {
  id: PersonaId;
  label: string;
  roleLabel: string;
  description: string;
  accentColor: string;
  landingPath: string;
  scopedNav: string[];
  avatarInitials: string;
};

export const PERSONAS: PersonaDef[] = [
  {
    id: "ceo",
    label: "CEO / Board",
    roleLabel: "CEO · Board",
    description: "Org-wide health snapshot and risk signals",
    accentColor: "var(--accent)",
    landingPath: "/",
    avatarInitials: "AR",
    scopedNav: ["/", "/portfolio", "/clients", "/client-contracts", "/meetings", "/requisitions", "/finance", "/vendor-licenses", "/sla-performance", "/wfm", "/data-operations", "/ingestion", "/tasks"],
  },
  {
    id: "finance",
    label: "Finance Head",
    roleLabel: "Finance Head",
    description: "Budget vs actuals, variance, cashflow, leakage",
    accentColor: "var(--amber)",
    landingPath: "/finance",
    avatarInitials: "FH",
    scopedNav: ["/finance", "/portfolio", "/clients", "/client-contracts", "/meetings", "/vendor-licenses", "/data-operations", "/ingestion", "/tasks"],
  },
  {
    id: "wfm",
    label: "WFM Head",
    roleLabel: "WFM Head",
    description: "HC capacity, fill rate, ageing, gaps",
    accentColor: "var(--accent2)",
    landingPath: "/wfm",
    avatarInitials: "WH",
    scopedNav: ["/wfm", "/requisitions", "/clients", "/client-contracts", "/meetings", "/vendor-licenses", "/data-operations", "/ingestion", "/tasks"],
  },
  {
    id: "client_manager",
    label: "Client Manager",
    roleLabel: "Client Manager",
    description: "Account cockpit scoped to my clients",
    accentColor: "var(--green)",
    landingPath: "/clients",
    avatarInitials: "CM",
    scopedNav: ["/clients", "/client-contracts", "/meetings", "/requisitions", "/finance", "/vendor-licenses", "/sla-performance", "/ingestion", "/tasks"],
  },
  {
    id: "ops",
    label: "Platform Ops",
    roleLabel: "Platform Ops",
    description: "Data quality, ingestion audit, identity reconciliation",
    accentColor: "var(--text-subtle)",
    landingPath: "/ingestion",
    avatarInitials: "PO",
    scopedNav: ["/data-operations", "/ingestion", "/", "/portfolio", "/clients", "/client-contracts", "/meetings", "/requisitions", "/finance", "/vendor-licenses", "/sla-performance", "/wfm", "/tasks"],
  },
];

export type PersonaContextType = {
  persona: PersonaDef;
  setPersonaId: (id: PersonaId) => void;
  scopedClients: string[] | null;
  setScopedClients: (c: string[] | null) => void;
  isPersonaLocked: boolean;
  navAllowed: (path: string) => boolean;
};

const PersonaContext = createContext<PersonaContextType | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [personaId, setPersonaId] = useState<PersonaId>("ceo");
  const [scopedClients, setScopedClients] = useState<string[] | null>(null);
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  const navAllowed = (path: string) => {
    if (path === "/agent") return true;
    if (persona.id === "ops") return true;
    return persona.scopedNav.includes(path);
  };

  return (
    <PersonaContext.Provider
      value={{ persona, setPersonaId, scopedClients, setScopedClients, isPersonaLocked: false, navAllowed }}
    >
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona must be used within PersonaProvider");
  return ctx;
}
