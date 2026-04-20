import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type ResumeSupplierLicenseRow } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { PageHeader, PlatformKpi, PlatformSection } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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

export function VendorLicenses() {
  const [rows, setRows] = useState<ResumeSupplierLicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
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

  function openCreate() {
    resetForm();
    setSortOrder(String(rows.length));
    setDialogOpen(true);
  }

  function openEdit(r: ResumeSupplierLicenseRow) {
    setEditingId(r.id);
    setVendorName(r.vendor_name ?? "");
    setLoginIdsCount(r.login_ids_count != null ? String(r.login_ids_count) : "");
    setResumeInventory(r.resume_inventory ?? "");
    setJobPostings(r.job_postings != null ? String(r.job_postings) : "");
    setNaukriInvites(r.naukri_invites != null ? String(r.naukri_invites) : "");
    setUtilization(r.utilization ?? "");
    setStartDate(r.start_date?.slice(0, 10) ?? "");
    setEndDate(r.end_date?.slice(0, 10) ?? "");
    setDurationMonths(r.contract_duration_months != null ? String(r.contract_duration_months) : "");
    setCostInr(r.cost_inr != null ? String(r.cost_inr) : "");
    setPrimaryName(r.primary_person_name ?? "");
    setPrimaryPhone(r.primary_person_phone ?? "");
    setPrimaryEmail(r.primary_person_email ?? "");
    setSecondaryName(r.secondary_person_name ?? "");
    setSecondaryPhone(r.secondary_person_phone ?? "");
    setSecondaryEmail(r.secondary_person_email ?? "");
    setRemarks(r.remarks ?? "");
    setFyLabel(r.fiscal_year_label ?? "FY 2025-26");
    setSortOrder(String(r.sort_order ?? 0));
    setDialogOpen(true);
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
      } else {
        const created = await queries.createVendorLicense(body);
        setRows((prev) => [...prev, created].sort((a, b) => (a.sort_order - b.sort_order) || a.id - b.id));
      }
      setDialogOpen(false);
      resetForm();
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
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Delete failed";
      alert(msg);
    }
  }

  const lbl = (t: string) => (
    <span style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500 }}>{t}</span>
  );

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
          style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
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
                <tr key={r.id}>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>{r.id}</td>
                  <td style={{ fontWeight: 600, maxWidth: 200 }}>{r.vendor_name}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.login_ids_count ?? "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.resume_inventory ?? "—"}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.job_postings ?? "—"}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.naukri_invites ?? "—"}</td>
                  <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{r.utilization ?? "—"}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.start_date?.slice(0, 10) ?? "—"}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.end_date?.slice(0, 10) ?? "—"}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.contract_duration_months ?? "—"}</td>
                  <td style={{ fontSize: 11 }}>{r.cost_inr != null ? formatCurrency(r.cost_inr) : "—"}</td>
                  <td style={{ fontSize: 10, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.primary_person_name ?? ""}>
                    {r.primary_person_name ?? "—"}
                  </td>
                  <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{r.fiscal_year_label ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="platform-dialog__btn" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="platform-dialog__btn"
                      style={{ fontSize: 10, padding: "4px 8px", marginLeft: 6, color: "var(--red)", borderColor: "rgba(255,79,107,0.35)" }}
                      onClick={() => void removeRow(r.id)}
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

      <Sheet
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setDialogOpen(o);
        }}
      >
        <SheetContent className="new-contract-sheet flex min-h-0 flex-1 flex-col" side="right" showCloseButton>
          <div className="ncp-scroll min-h-0 flex-1" style={{ overflowY: "auto" }}>
            <SheetHeader className="platform-dialog__header" style={{ padding: "20px 24px 16px" }}>
              <div className="platform-dialog__eyebrow">{editingId != null ? `VENDOR LICENSES · EDIT · VND-${editingId}` : "VENDOR LICENSES · NEW ROW"}</div>
              <SheetTitle className="platform-dialog__title">{editingId != null ? "Update vendor license" : "Add vendor license"}</SheetTitle>
              <SheetDescription className="platform-dialog__desc">
                Independent of projects. Use sort order to control table sequence. Leave numeric fields blank if not applicable.
              </SheetDescription>
            </SheetHeader>
            <div style={{ padding: "20px 24px", display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Job board / vendor *")}
                  <input className="platform-search" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Naukri – Taggd (Main)" />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Login IDs (count)")}
                  <input className="platform-search" inputMode="numeric" value={loginIdsCount} onChange={(e) => setLoginIdsCount(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Sort order")}
                  <input className="platform-search" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Resume inventory")}
                  <input className="platform-search" value={resumeInventory} onChange={(e) => setResumeInventory(e.target.value)} placeholder="300,000 / Unlimited" />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Job postings")}
                  <input className="platform-search" inputMode="numeric" value={jobPostings} onChange={(e) => setJobPostings(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Naukri invites")}
                  <input className="platform-search" inputMode="numeric" value={naukriInvites} onChange={(e) => setNaukriInvites(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Utilization")}
                  <input className="platform-search" value={utilization} onChange={(e) => setUtilization(e.target.value)} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Start date")}
                  <input className="platform-search" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("End date")}
                  <input className="platform-search" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Duration (months)")}
                  <input className="platform-search" inputMode="numeric" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Cost (INR)")}
                  <input className="platform-search" inputMode="decimal" value={costInr} onChange={(e) => setCostInr(e.target.value)} placeholder="49150120" />
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {lbl("Fiscal year label")}
                <input className="platform-search" value={fyLabel} onChange={(e) => setFyLabel(e.target.value)} />
              </label>
              <div style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Primary person</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Name")}
                  <input className="platform-search" value={primaryName} onChange={(e) => setPrimaryName(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Phone")}
                  <input className="platform-search" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Email")}
                  <input className="platform-search" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} />
                </label>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Secondary person</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Name")}
                  <input className="platform-search" value={secondaryName} onChange={(e) => setSecondaryName(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Phone")}
                  <input className="platform-search" value={secondaryPhone} onChange={(e) => setSecondaryPhone(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {lbl("Email")}
                  <input className="platform-search" value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)} />
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {lbl("Remarks")}
                <textarea className="platform-search" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} style={{ resize: "vertical" }} />
              </label>
            </div>
          </div>
          <div className="platform-dialog__footer" style={{ flexShrink: 0 }}>
            <button type="button" className="platform-dialog__btn" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="platform-dialog__btn platform-dialog__btn--primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editingId != null ? "Save" : "Create"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
