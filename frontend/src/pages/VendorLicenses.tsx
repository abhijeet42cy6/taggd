import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type ResumeSupplierLicenseRow } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatLargeCurrency } from "@/lib/utils";
import { PageHeader, PlatformKpi, PlatformSection } from "@/components/platform/PlatformBlocks";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { Skeleton } from "@/components/platform/Skeleton";
import "@/styles/new-contract-panel.css";

function numOrUndef(s: string): number | null | undefined {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function intOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

type DrawerMode = "view" | "edit" | "create";

const VL_TABS: { icon: string; label: string }[] = [
  { icon: "◇", label: "Overview" },
  { icon: "📅", label: "Contract" },
  { icon: "👥", label: "People" },
  { icon: "💬", label: "Notes" },
];

function VlSection({
  icon,
  iconTone,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconTone?: "orange" | "blue" | "green" | "amber" | "accent";
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ncp-section">
      <div className="ncp-section-header">
        <span className={cn("ncp-section-icon", iconTone && `ncp-${iconTone}`)}>{icon}</span>
        <div>
          <div className="ncp-section-label">{title}</div>
          {description ? <div className="ncp-section-desc">{description}</div> : null}
        </div>
      </div>
      <div className="ncp-section-body">{children}</div>
    </div>
  );
}

function VlReadRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ncp-prop-row">
      <span className="ncp-prop-label">{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ncp-text-primary)", alignSelf: "center" }}>{value}</span>
    </div>
  );
}

function VlField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ncp-prop-row">
      <span className="ncp-prop-label">{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function hydrateFormFromRow(
  r: ResumeSupplierLicenseRow,
  setters: {
    setVendorName: (v: string) => void;
    setLoginIdsCount: (v: string) => void;
    setResumeInventory: (v: string) => void;
    setJobPostings: (v: string) => void;
    setNaukriInvites: (v: string) => void;
    setUtilization: (v: string) => void;
    setStartDate: (v: string) => void;
    setEndDate: (v: string) => void;
    setDurationMonths: (v: string) => void;
    setCostInr: (v: string) => void;
    setPrimaryName: (v: string) => void;
    setPrimaryPhone: (v: string) => void;
    setPrimaryEmail: (v: string) => void;
    setSecondaryName: (v: string) => void;
    setSecondaryPhone: (v: string) => void;
    setSecondaryEmail: (v: string) => void;
    setRemarks: (v: string) => void;
    setFyLabel: (v: string) => void;
    setSortOrder: (v: string) => void;
  },
) {
  setters.setVendorName(r.vendor_name ?? "");
  setters.setLoginIdsCount(r.login_ids_count != null ? String(r.login_ids_count) : "");
  setters.setResumeInventory(r.resume_inventory ?? "");
  setters.setJobPostings(r.job_postings != null ? String(r.job_postings) : "");
  setters.setNaukriInvites(r.naukri_invites != null ? String(r.naukri_invites) : "");
  setters.setUtilization(r.utilization ?? "");
  setters.setStartDate(r.start_date?.slice(0, 10) ?? "");
  setters.setEndDate(r.end_date?.slice(0, 10) ?? "");
  setters.setDurationMonths(r.contract_duration_months != null ? String(r.contract_duration_months) : "");
  setters.setCostInr(r.cost_inr != null ? String(r.cost_inr) : "");
  setters.setPrimaryName(r.primary_person_name ?? "");
  setters.setPrimaryPhone(r.primary_person_phone ?? "");
  setters.setPrimaryEmail(r.primary_person_email ?? "");
  setters.setSecondaryName(r.secondary_person_name ?? "");
  setters.setSecondaryPhone(r.secondary_person_phone ?? "");
  setters.setSecondaryEmail(r.secondary_person_email ?? "");
  setters.setRemarks(r.remarks ?? "");
  setters.setFyLabel(r.fiscal_year_label ?? "FY 2025-26");
  setters.setSortOrder(String(r.sort_order ?? 0));
}

export function VendorLicenses() {
  const [rows, setRows] = useState<ResumeSupplierLicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [viewRow, setViewRow] = useState<ResumeSupplierLicenseRow | null>(null);
  const [sheetTab, setSheetTab] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [vendorName, setVendorName] = useState("");
  const [loginIdsCount, setLoginIdsCount] = useState("");
  const [resumeInventory, setResumeInventory] = useState("");
  const [jobPostings, setJobPostings] = useState("");
  const [naukriInvites, setNaukriInvites] = useState("");
  const [utilization, setUtilization] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [costInr, setCostInr] = useState("");
  const [primaryName, setPrimaryName] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [remarks, setRemarks] = useState("");
  const [fyLabel, setFyLabel] = useState("FY 2025-26");
  const [sortOrder, setSortOrder] = useState("0");

  const setters = useMemo(
    () => ({
      setVendorName,
      setLoginIdsCount,
      setResumeInventory,
      setJobPostings,
      setNaukriInvites,
      setUtilization,
      setStartDate,
      setEndDate,
      setDurationMonths,
      setCostInr,
      setPrimaryName,
      setPrimaryPhone,
      setPrimaryEmail,
      setSecondaryName,
      setSecondaryPhone,
      setSecondaryEmail,
      setRemarks,
      setFyLabel,
      setSortOrder,
    }),
    [],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    queries
      .vendorLicensesList()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (drawerOpen) setSheetTab(0);
  }, [drawerOpen, drawerMode]);

  const totalCost = useMemo(
    () => rows.reduce((s, r) => s + (r.cost_inr != null && Number.isFinite(r.cost_inr) ? r.cost_inr : 0), 0),
    [rows],
  );

  const fyCount = useMemo(() => new Set(rows.map((r) => r.fiscal_year_label).filter(Boolean)).size, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [r.vendor_name, r.fiscal_year_label, r.remarks, String(r.id)].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  function resetForm() {
    setEditingId(null);
    setVendorName("");
    setLoginIdsCount("");
    setResumeInventory("");
    setJobPostings("");
    setNaukriInvites("");
    setUtilization("");
    setStartDate("");
    setEndDate("");
    setDurationMonths("");
    setCostInr("");
    setPrimaryName("");
    setPrimaryPhone("");
    setPrimaryEmail("");
    setSecondaryName("");
    setSecondaryPhone("");
    setSecondaryEmail("");
    setRemarks("");
    setFyLabel("FY 2025-26");
    setSortOrder("0");
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setViewRow(null);
    setDrawerMode("create");
    resetForm();
  }

  function openView(r: ResumeSupplierLicenseRow) {
    setViewRow(r);
    setDrawerMode("view");
    setEditingId(null);
    setDrawerOpen(true);
  }

  function openCreate() {
    resetForm();
    setSortOrder(String(rows.length));
    setViewRow(null);
    setEditingId(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  }

  function openEdit(r: ResumeSupplierLicenseRow) {
    setEditingId(r.id);
    hydrateFormFromRow(r, setters);
    setViewRow(r);
    setDrawerMode("edit");
    setDrawerOpen(true);
  }

  function beginEditFromView() {
    if (!viewRow) return;
    setEditingId(viewRow.id);
    hydrateFormFromRow(viewRow, setters);
    setDrawerMode("edit");
  }

  function buildPayload(): Record<string, unknown> {
    const login = intOrNull(loginIdsCount);
    const jp = intOrNull(jobPostings);
    const ni = intOrNull(naukriInvites);
    const dur = intOrNull(durationMonths);
    const so = intOrNull(sortOrder);
    const costRaw = numOrUndef(costInr);
    return {
      vendor_name: vendorName.trim(),
      login_ids_count: login,
      resume_inventory: resumeInventory.trim() || null,
      job_postings: jp,
      naukri_invites: ni,
      utilization: utilization.trim() || null,
      start_date: startDate.trim() || null,
      end_date: endDate.trim() || null,
      contract_duration_months: dur,
      cost_inr: costRaw === undefined ? null : costRaw,
      primary_person_name: primaryName.trim() || null,
      primary_person_phone: primaryPhone.trim() || null,
      primary_person_email: primaryEmail.trim() || null,
      secondary_person_name: secondaryName.trim() || null,
      secondary_person_phone: secondaryPhone.trim() || null,
      secondary_person_email: secondaryEmail.trim() || null,
      remarks: remarks.trim() || null,
      fiscal_year_label: fyLabel.trim() || null,
      sort_order: so ?? 0,
    };
  }

  async function save() {
    if (!vendorName.trim()) {
      alert("Vendor name is required.");
      return;
    }
    if (costInr.trim()) {
      const c = numOrUndef(costInr);
      if (c === undefined) {
        alert("Cost (INR) must be a valid number.");
        return;
      }
    }
    setSaving(true);
    try {
      const body = buildPayload();
      if (editingId != null) {
        const updated = await queries.patchVendorLicense(editingId, body);
        setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setViewRow(updated);
      } else {
        const created = await queries.createVendorLicense(body);
        setRows((prev) => [...prev, created].sort((a, b) => (a.sort_order - b.sort_order) || a.id - b.id));
      }
      closeDrawer();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Save failed";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: number) {
    if (!window.confirm(`Delete vendor license row #${id}?`)) return;
    try {
      await queries.deleteVendorLicense(id);
      setRows((prev) => prev.filter((x) => x.id !== id));
      if (viewRow?.id === id || editingId === id) closeDrawer();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Delete failed";
      alert(msg);
    }
  }

  const displayRow = drawerMode === "view" ? viewRow : viewRow ?? (editingId != null ? rows.find((x) => x.id === editingId) ?? null : null);
  const breadcrumbId = displayRow?.id ?? editingId;
  const sheetTitle =
    drawerMode === "create" ? "New vendor license" : drawerMode === "view" ? (viewRow?.vendor_name ?? "Vendor") : vendorName.trim() || "Vendor license";

  const readOnly = drawerMode === "view";

  function renderViewPanels(r: ResumeSupplierLicenseRow) {
    return (
      <>
        {sheetTab === 0 ? (
          <VlSection icon="◇" iconTone="orange" title="Vendor & usage" description="Job board line and capacity signals.">
            <VlReadRow label="Job board / vendor" value={r.vendor_name || "—"} />
            <VlReadRow label="Login IDs (count)" value={r.login_ids_count ?? "—"} />
            <VlReadRow label="Sort order" value={String(r.sort_order ?? 0)} />
            <VlReadRow label="Resume inventory" value={r.resume_inventory || "—"} />
            <VlReadRow label="Job postings" value={r.job_postings ?? "—"} />
            <VlReadRow label="Naukri invites" value={r.naukri_invites ?? "—"} />
            <VlReadRow label="Utilization" value={r.utilization || "—"} />
          </VlSection>
        ) : null}
        {sheetTab === 1 ? (
          <VlSection icon="📅" iconTone="blue" title="Contract & cost" description="Term and commercial snapshot.">
            <VlReadRow label="Start date" value={r.start_date ? formatDate(r.start_date.slice(0, 10)) : "—"} />
            <VlReadRow label="End date" value={r.end_date ? formatDate(r.end_date.slice(0, 10)) : "—"} />
            <VlReadRow label="Duration (months)" value={r.contract_duration_months ?? "—"} />
            <VlReadRow label="Cost (INR)" value={r.cost_inr != null ? formatLargeCurrency(r.cost_inr) : "—"} />
            <VlReadRow label="Fiscal year" value={r.fiscal_year_label || "—"} />
          </VlSection>
        ) : null}
        {sheetTab === 2 ? (
          <>
            <VlSection icon="👤" iconTone="green" title="Primary contact" description="Main vendor relationship owner.">
              <VlReadRow label="Name" value={r.primary_person_name || "—"} />
              <VlReadRow label="Phone" value={r.primary_person_phone || "—"} />
              <VlReadRow label="Email" value={r.primary_person_email || "—"} />
            </VlSection>
            <div style={{ height: 14 }} />
            <VlSection icon="👤" iconTone="amber" title="Secondary contact" description="Optional backup contact.">
              <VlReadRow label="Name" value={r.secondary_person_name || "—"} />
              <VlReadRow label="Phone" value={r.secondary_person_phone || "—"} />
              <VlReadRow label="Email" value={r.secondary_person_email || "—"} />
            </VlSection>
          </>
        ) : null}
        {sheetTab === 3 ? (
          <VlSection icon="💬" iconTone="accent" title="Remarks" description="Internal notes from your tracker.">
            <p className="ncp-hint" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {(r.remarks && r.remarks.trim()) || "—"}
            </p>
          </VlSection>
        ) : null}
      </>
    );
  }

  function renderEditPanels() {
    return (
      <>
        {sheetTab === 0 ? (
          <VlSection icon="◇" iconTone="orange" title="Vendor & usage" description="Names and counts shown on the license tracker.">
            <VlField label="Job board / vendor *">
              <input className="ncp-prop-input" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. LinkedIn" />
            </VlField>
            <VlField label="Login IDs (count)">
              <input className="ncp-prop-input" inputMode="numeric" value={loginIdsCount} onChange={(e) => setLoginIdsCount(e.target.value)} />
            </VlField>
            <VlField label="Sort order">
              <input className="ncp-prop-input" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </VlField>
            <VlField label="Resume inventory">
              <input className="ncp-prop-input" value={resumeInventory} onChange={(e) => setResumeInventory(e.target.value)} placeholder="300,000 / Unlimited" />
            </VlField>
            <VlField label="Job postings">
              <input className="ncp-prop-input" inputMode="numeric" value={jobPostings} onChange={(e) => setJobPostings(e.target.value)} />
            </VlField>
            <VlField label="Naukri invites">
              <input className="ncp-prop-input" inputMode="numeric" value={naukriInvites} onChange={(e) => setNaukriInvites(e.target.value)} />
            </VlField>
            <VlField label="Utilization">
              <input className="ncp-prop-input" value={utilization} onChange={(e) => setUtilization(e.target.value)} />
            </VlField>
          </VlSection>
        ) : null}
        {sheetTab === 1 ? (
          <VlSection icon="📅" iconTone="blue" title="Contract & cost" description="Leave dates blank if not on contract yet.">
            <VlField label="Start date">
              <input className="ncp-prop-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </VlField>
            <VlField label="End date">
              <input className="ncp-prop-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </VlField>
            <VlField label="Duration (months)">
              <input className="ncp-prop-input" inputMode="numeric" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
            </VlField>
            <VlField label="Cost (INR)">
              <input className="ncp-prop-input" inputMode="decimal" value={costInr} onChange={(e) => setCostInr(e.target.value)} placeholder="49150120" />
            </VlField>
            <VlField label="Fiscal year label">
              <input className="ncp-prop-input" value={fyLabel} onChange={(e) => setFyLabel(e.target.value)} />
            </VlField>
          </VlSection>
        ) : null}
        {sheetTab === 2 ? (
          <>
            <VlSection icon="👤" iconTone="green" title="Primary contact" description="Main relationship owner.">
              <VlField label="Name">
                <input className="ncp-prop-input" value={primaryName} onChange={(e) => setPrimaryName(e.target.value)} />
              </VlField>
              <VlField label="Phone">
                <input className="ncp-prop-input" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
              </VlField>
              <VlField label="Email">
                <input className="ncp-prop-input" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} />
              </VlField>
            </VlSection>
            <div style={{ height: 14 }} />
            <VlSection icon="👤" iconTone="amber" title="Secondary contact" description="Optional.">
              <VlField label="Name">
                <input className="ncp-prop-input" value={secondaryName} onChange={(e) => setSecondaryName(e.target.value)} />
              </VlField>
              <VlField label="Phone">
                <input className="ncp-prop-input" value={secondaryPhone} onChange={(e) => setSecondaryPhone(e.target.value)} />
              </VlField>
              <VlField label="Email">
                <input className="ncp-prop-input" value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)} />
              </VlField>
            </VlSection>
          </>
        ) : null}
        {sheetTab === 3 ? (
          <VlSection icon="💬" iconTone="accent" title="Remarks" description="Shown on reports and the activity context.">
            <textarea className="ncp-prop-input" rows={5} value={remarks} onChange={(e) => setRemarks(e.target.value)} style={{ width: "100%", minHeight: 100 }} />
          </VlSection>
        ) : null}
      </>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <PageHeader
          title="Job board & vendor licenses"
          subtitle="Taggd recruitment technology and sourcing spend — org-wide (not tied to projects). Edit costs, contract dates, and contacts."
        />
        <button
          type="button"
          className="platform-dialog__btn platform-dialog__btn--primary"
          style={{ fontSize: 11, fontFamily: "var(--mono)" }}
          onClick={() => openCreate()}
        >
          + Add vendor row
        </button>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={72} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <PlatformKpi label="Vendor rows" value={rows.length} accent="blue" subtext="Active lines" />
          <PlatformKpi
            label="Σ License cost (INR)"
            value={totalCost > 0 ? formatCurrency(totalCost) : "—"}
            accent="green"
            subtext="Sum of row amounts"
          />
          <PlatformKpi label="FY labels in use" value={fyCount} accent="teal" subtext="Distinct fiscal_year_label" />
        </div>
      )}

      <PlatformSection title="License tracker" action="Refresh" onAction={refresh}>
        <div style={{ marginBottom: 12 }}>
          <input
            className="platform-search"
            placeholder="Search vendor, FY, remarks, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 400, width: "100%" }}
          />
        </div>
        <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
          <table className="platform-table" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Vendor</th>
                <th>Logins</th>
                <th>Resume inv.</th>
                <th>Postings</th>
                <th>Naukri invites</th>
                <th>Utilization</th>
                <th>Start</th>
                <th>End</th>
                <th>Mo</th>
                <th>Cost (INR)</th>
                <th>Primary contact</th>
                <th>FY</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={14} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                    No rows yet. Add vendors from your JOB BOARD / VENDOR LICENSE TRACKER.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => openView(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openView(r);
                    }
                  }}
                >
                  <td style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)" }}>{r.id}</td>
                  <td style={{ fontWeight: 600, maxWidth: 200 }}>{r.vendor_name}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{r.login_ids_count ?? "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.resume_inventory ?? "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{r.job_postings ?? "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{r.naukri_invites ?? "—"}</td>
                  <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{r.utilization ?? "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{r.start_date?.slice(0, 10) ?? "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{r.end_date?.slice(0, 10) ?? "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{r.contract_duration_months ?? "—"}</td>
                  <td style={{ fontSize: 11 }}>{r.cost_inr != null ? formatCurrency(r.cost_inr) : "—"}</td>
                  <td style={{ fontSize: 10, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.primary_person_name ?? ""}>
                    {r.primary_person_name ?? "—"}
                  </td>
                  <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{r.fiscal_year_label ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="platform-dialog__btn"
                      style={{ fontSize: 10, padding: "4px 8px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="platform-dialog__btn"
                      style={{ fontSize: 10, padding: "4px 8px", marginLeft: 6, color: "var(--red)", borderColor: "rgba(255,79,107,0.35)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeRow(r.id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PlatformSection>

      <PlatformDrawer open={drawerOpen} onClose={closeDrawer} title=" " embeddedChrome>
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Settings</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>Vendor licenses</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10 }}>
                      {drawerMode === "create" ? "NEW" : `VND-${breadcrumbId ?? "—"}`}
                    </span>
                  </div>
                  <h1 className="ncp-h1">{sheetTitle}</h1>
                  <div className="ncp-subtitle">
                    {drawerMode === "view" && viewRow ? (
                      <>
                        <span style={{ fontFamily: "var(--ncp-mono)", color: "var(--ncp-text-muted)" }}>{`#${viewRow.id}`}</span>
                        <span style={{ color: "var(--ncp-text-muted)", margin: "0 6px" }}>·</span>
                        <span>{viewRow.fiscal_year_label || "—"}</span>
                        {viewRow.start_date ? (
                          <>
                            <span style={{ color: "var(--ncp-text-muted)", margin: "0 6px" }}>·</span>
                            <span>From {formatDate(viewRow.start_date.slice(0, 10))}</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span style={{ color: "var(--ncp-text-muted)" }}>
                        {drawerMode === "create"
                          ? "Org-wide vendor line — not tied to a project. Use tabs to complete each section."
                          : "Update job board spend, contract window, and contacts. Save when ready."}
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={closeDrawer}>
                  ✕
                </button>
              </div>

              {(drawerMode !== "create" && displayRow) || drawerMode === "create" ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    background: "var(--ncp-surface)",
                    border: "1px solid var(--ncp-border)",
                    borderRadius: "var(--ncp-radius-lg)",
                    marginBottom: 14,
                  }}
                >
                  {drawerMode === "view" && viewRow ? (
                    <>
                      <span className="ncp-status-pill ncp-st-active">Active row</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--ncp-mono)",
                          background: "var(--ncp-accent-soft)",
                          color: "var(--ncp-accent)",
                          border: "1px solid var(--ncp-accent-mid)",
                          borderRadius: 999,
                          padding: "3px 10px",
                        }}
                      >
                        {viewRow.fiscal_year_label || "FY —"}
                      </span>
                      <span style={{ flex: 1 }} />
                      {viewRow.cost_inr != null ? (
                        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          Cost {formatLargeCurrency(viewRow.cost_inr)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>Cost —</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="ncp-status-pill ncp-st-pending">{drawerMode === "create" ? "Draft row" : "Editing"}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>Fields use the same validation as the legacy form</span>
                    </>
                  )}
                </div>
              ) : null}

              <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                {VL_TABS.map(({ icon, label }, i) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={sheetTab === i}
                    className={cn("ncp-step", sheetTab === i && "ncp-active")}
                    onClick={() => setSheetTab(i)}
                  >
                    <span
                      className="ncp-step-num"
                      style={{
                        fontSize: 14,
                        background: sheetTab === i ? "rgba(255,255,255,0.22)" : "var(--ncp-border)",
                      }}
                    >
                      {icon}
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              {readOnly && viewRow ? renderViewPanels(viewRow) : renderEditPanels()}
            </div>
          </div>

          <div className="ncp-footer">
            {readOnly ? (
              <>
                <button type="button" className="ncp-btn ncp-btn-ghost" style={{ fontSize: 13, padding: "8px 14px" }} onClick={closeDrawer}>
                  Close
                </button>
                <button type="button" className="ncp-btn ncp-btn-primary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={beginEditFromView}>
                  Edit
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ncp-btn ncp-btn-ghost" style={{ fontSize: 13, padding: "8px 14px" }} disabled={saving} onClick={closeDrawer}>
                  Cancel
                </button>
                <button type="button" className="ncp-btn ncp-btn-primary" style={{ fontSize: 13, padding: "8px 14px" }} disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : editingId != null ? "Save changes ✓" : "Create row ✓"}
                </button>
              </>
            )}
          </div>
        </div>
      </PlatformDrawer>
    </div>
  );
}
