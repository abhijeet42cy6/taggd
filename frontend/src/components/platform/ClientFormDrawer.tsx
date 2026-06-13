import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminApi, queries, type Project } from "@/lib/api";
import type { ClientVm } from "@/lib/view-models/clients";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import { WfmProjectOrgFields } from "@/components/platform/WfmProjectOrgFields";
import {
  emptyWfmOrgMetadataDraft,
  wfmOrgDraftFromSources,
  wfmOrgMetadataPatchBody,
  type RegionalHeadCandidate,
} from "@/lib/wfm-org-metadata";
import { cn } from "@/lib/utils";
import { projectDirectoryOptionSets } from "@/lib/project-directory-options";
import "@/styles/new-contract-panel.css";

const CLIENT_TABS = [
  { icon: "🏢", label: "Client" },
  { icon: "◇", label: "Project" },
  { icon: "🌍", label: "Geography" },
  { icon: "👤", label: "Leadership" },
  { icon: "🔗", label: "Hierarchy" },
  { icon: "📋", label: "Tracker" },
] as const;

export type ClientFormDrawerProps = {
  open: boolean;
  onClose: () => void;
  clientVm: ClientVm | null;
  numericClientId: number | null;
  defaultProjectId?: number | null;
  onSuccess: () => void | Promise<void>;
};

type ClientDraft = {
  official_name: string;
  short_code: string;
  lifecycle_state: "active" | "prospect";
  hierarchy_tag_bu: string;
  hierarchy_tag_sbu: string;
  hierarchy_tag_sbg: string;
  hierarchy_tag_sbe: string;
};

type ProjectDraft = {
  account_name: string;
  engagement_name: string;
  charge_code: string;
  account_status: string;
  sub_region: string;
  category: string;
  vertical: string;
  practice: string;
  project_head: string;
  be_spoc: string;
  project_head_user_id: string;
  org_unit_kind: string;
  parent_project_id: string;
  hierarchy_tag_bu: string;
  hierarchy_tag_sbu: string;
  hierarchy_tag_sbg: string;
  hierarchy_tag_sbe: string;
  tracker_sheet: string;
  contract_sheet: string;
  pos_id_column: string;
  revenue_logic_code: string;
  logic_explanation: string;
  filename: string;
  source_filename: string;
  org: ReturnType<typeof emptyWfmOrgMetadataDraft>;
};

function s(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function clientDraftFromVm(clientVm: ClientVm): ClientDraft {
  return {
    official_name: clientVm.officialName,
    short_code: s(clientVm.shortCode),
    lifecycle_state: clientVm.lifecycleState === "prospect" ? "prospect" : "active",
    hierarchy_tag_bu: s(clientVm.hierarchyTagBu),
    hierarchy_tag_sbu: s(clientVm.hierarchyTagSbu),
    hierarchy_tag_sbg: s(clientVm.hierarchyTagSbg),
    hierarchy_tag_sbe: s(clientVm.hierarchyTagSbe),
  };
}

function projectDraftFromProject(project: Project, orgUsers: RegionalHeadCandidate[]): ProjectDraft {
  return {
    account_name: s(project.account_name),
    engagement_name: s(project.engagement_name),
    charge_code: s(project.charge_code),
    account_status: s(project.account_status),
    sub_region: s(project.sub_region),
    category: s(project.category),
    vertical: s(project.vertical),
    practice: s(project.practice),
    project_head: s(project.project_head),
    be_spoc: s(project.be_spoc),
    project_head_user_id: project.project_head_user_id != null ? String(project.project_head_user_id) : "",
    org_unit_kind: project.org_unit_kind || "sub_business_unit",
    parent_project_id: project.parent_project_id != null ? String(project.parent_project_id) : "",
    hierarchy_tag_bu: s(project.hierarchy_tag_bu),
    hierarchy_tag_sbu: s(project.hierarchy_tag_sbu),
    hierarchy_tag_sbg: s(project.hierarchy_tag_sbg),
    hierarchy_tag_sbe: s(project.hierarchy_tag_sbe),
    tracker_sheet: s(project.tracker_sheet),
    contract_sheet: s(project.contract_sheet),
    pos_id_column: s(project.pos_id_column),
    revenue_logic_code: s(project.revenue_logic_code),
    logic_explanation: s(project.logic_explanation),
    filename: s(project.filename),
    source_filename: s(project.source_filename),
    org: wfmOrgDraftFromSources(project, orgUsers),
  };
}

function httpDetail(e: unknown): string {
  const d =
    e && typeof e === "object" && "response" in e
      ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      : undefined;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return "";
}

function DirectoryFieldSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "— Select —",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <select
        className="ncp-prop-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ClientFormDrawer({
  open,
  onClose,
  clientVm,
  numericClientId,
  defaultProjectId,
  onSuccess,
}: ClientFormDrawerProps) {
  const projects = clientVm?.projects ?? [];
  const canEditClient = numericClientId != null && numericClientId > 0 && (clientVm?.id ?? 0) >= 0;

  const [tab, setTab] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [clientDraft, setClientDraft] = useState<ClientDraft>(() =>
    clientVm ? clientDraftFromVm(clientVm) : {
      official_name: "",
      short_code: "",
      lifecycle_state: "active",
      hierarchy_tag_bu: "",
      hierarchy_tag_sbu: "",
      hierarchy_tag_sbg: "",
      hierarchy_tag_sbe: "",
    },
  );
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(() =>
    projectDraftFromProject(projects[0] ?? ({} as Project), []),
  );
  const [orgUsers, setOrgUsers] = useState<RegionalHeadCandidate[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUserLite[]>([]);
  const [optionProjects, setOptionProjects] = useState<Project[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projSearch, setProjSearch] = useState("");
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  const selectedProject = useMemo(() => {
    const pid = parseInt(selectedProjectId, 10);
    if (!Number.isFinite(pid)) return null;
    return projects.find((p) => p.id === pid) ?? null;
  }, [selectedProjectId, projects]);

  const buOptions = useMemo(
    () =>
      projects.filter(
        (b) =>
          b.id !== selectedProject?.id &&
          (b.org_unit_kind || "sub_business_unit") === "business_unit",
      ),
    [projects, selectedProject?.id],
  );

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = `prj-${p.id} ${p.engagement_name || p.account_name || p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projects, projSearch]);

  const directoryOptions = useMemo(
    () =>
      projectDirectoryOptionSets(optionProjects.length ? optionProjects : projects, selectedProject ?? undefined),
    [optionProjects, projects, selectedProject],
  );

  useEffect(() => {
    if (!open) return;
    setTab(0);
    setError(null);
    if (clientVm) setClientDraft(clientDraftFromVm(clientVm));
    const initial =
      defaultProjectId != null && projects.some((p) => p.id === defaultProjectId)
        ? String(defaultProjectId)
        : projects[0]
          ? String(projects[0].id)
          : "";
    setSelectedProjectId(initial);
    queries
      .projects()
      .then(setOptionProjects)
      .catch(() => setOptionProjects(projects));
  }, [open, clientVm, defaultProjectId, projects]);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    adminApi
      .listUsers()
      .then((rows) => {
        const mapped: RegionalHeadCandidate[] = rows.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
        }));
        setOrgUsers(mapped);
        setPlatformUsers(
          rows.map((u) => ({
            id: u.id,
            email: u.email,
            role: u.role,
          })),
        );
      })
      .catch(() => {
        setOrgUsers([]);
        setPlatformUsers([]);
      })
      .finally(() => setLoadingUsers(false));
  }, [open]);

  useEffect(() => {
    if (!open || loadingUsers || !selectedProject) return;
    setProjectDraft(projectDraftFromProject(selectedProject, orgUsers));
  }, [open, loadingUsers, selectedProject?.id, orgUsers]);

  useLayoutEffect(() => {
    if (!projDdOpen) {
      setProjDdRect(null);
      return;
    }
    const measure = () => {
      const btn = projBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setProjDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (projBtnRef.current) ro.observe(projBtnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [projDdOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (projWrapRef.current?.contains(t) || projPortalRef.current?.contains(t)) return;
      setProjDdOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const setClient = <K extends keyof ClientDraft>(k: K, v: ClientDraft[K]) =>
    setClientDraft((d) => ({ ...d, [k]: v }));

  const setProject = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) =>
    setProjectDraft((d) => ({ ...d, [k]: v }));

  const submit = useCallback(async () => {
    if (!selectedProject) {
      setError("Select a project to save SBU / tracker fields.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (canEditClient && numericClientId) {
        await queries.patchClient(numericClientId, {
          official_name: clientDraft.official_name.trim(),
          short_code: clientDraft.short_code.trim() || null,
          lifecycle_state: clientDraft.lifecycle_state,
          hierarchy_tag_bu: clientDraft.hierarchy_tag_bu.trim() || null,
          hierarchy_tag_sbu: clientDraft.hierarchy_tag_sbu.trim() || null,
          hierarchy_tag_sbg: clientDraft.hierarchy_tag_sbg.trim() || null,
          hierarchy_tag_sbe: clientDraft.hierarchy_tag_sbe.trim() || null,
        });
      }

      const pid = selectedProject.id;
      const isBu = projectDraft.org_unit_kind === "business_unit";
      const headUid = projectDraft.project_head_user_id.trim();
      const orgPatch = wfmOrgMetadataPatchBody(projectDraft.org, orgUsers);

      await queries.patchProjectMetadata(pid, {
        account_name: projectDraft.account_name.trim() || undefined,
        engagement_name: projectDraft.engagement_name.trim() || undefined,
        charge_code: projectDraft.charge_code.trim() || undefined,
        account_status: projectDraft.account_status.trim() || undefined,
        sub_region: projectDraft.sub_region.trim() || undefined,
        category: projectDraft.category.trim() || undefined,
        vertical: projectDraft.vertical.trim() || undefined,
        practice: projectDraft.practice.trim() || undefined,
        project_head: projectDraft.project_head.trim() || undefined,
        be_spoc: projectDraft.be_spoc.trim() || undefined,
        org_unit_kind: projectDraft.org_unit_kind,
        parent_project_id: isBu
          ? null
          : projectDraft.parent_project_id
            ? parseInt(projectDraft.parent_project_id, 10)
            : null,
        hierarchy_tag_bu: projectDraft.hierarchy_tag_bu.trim() || null,
        hierarchy_tag_sbu: projectDraft.hierarchy_tag_sbu.trim() || null,
        hierarchy_tag_sbg: projectDraft.hierarchy_tag_sbg.trim() || null,
        hierarchy_tag_sbe: projectDraft.hierarchy_tag_sbe.trim() || null,
        project_head_user_id: headUid ? parseInt(headUid, 10) : null,
        tracker_sheet: projectDraft.tracker_sheet.trim() || undefined,
        contract_sheet: projectDraft.contract_sheet.trim() || undefined,
        pos_id_column: projectDraft.pos_id_column.trim() || undefined,
        ...orgPatch,
      });

      await queries.updateProjectLogic(pid, {
        revenue_logic_code: projectDraft.revenue_logic_code,
        logic_explanation: projectDraft.logic_explanation,
        tracker_sheet: projectDraft.tracker_sheet.trim() || undefined,
        contract_sheet: projectDraft.contract_sheet.trim() || undefined,
        filename: projectDraft.filename.trim() || undefined,
        source_filename: projectDraft.source_filename.trim() || undefined,
      });

      await onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(httpDetail(e) || (e instanceof Error ? e.message : "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [
    canEditClient,
    numericClientId,
    clientDraft,
    selectedProject,
    projectDraft,
    orgUsers,
    onSuccess,
    onClose,
  ]);

  const section = (icon: string, colorCls: string, label: string, desc: string, body: React.ReactNode) => (
    <div className="ncp-section" style={{ marginBottom: 12 }}>
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", colorCls)}>{icon}</div>
        <div>
          <div className="ncp-section-label">{label}</div>
          <div className="ncp-section-desc">{desc}</div>
        </div>
      </div>
      <div className="ncp-section-body" style={{ maxHeight: "none" }}>
        {body}
      </div>
    </div>
  );

  const projectPicker = (
    <div ref={projWrapRef} className="ncp-project-wrap" style={{ borderTop: "none" }}>
      <button
        ref={projBtnRef}
        type="button"
        className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
        onClick={(e) => {
          e.stopPropagation();
          setProjDdOpen((o) => !o);
        }}
      >
        {selectedProject ? (
          <>
            <span className="ncp-project-icon" style={{ fontSize: 12 }}>
              PRJ
            </span>
            <div className="ncp-project-meta">
              <strong>
                {selectedProject.engagement_name || selectedProject.account_name || selectedProject.filename || `Project ${selectedProject.id}`}
              </strong>
              <span style={{ fontFamily: "var(--ncp-mono)", color: "var(--ncp-accent)" }}>PRJ-{selectedProject.id}</span>
            </div>
          </>
        ) : (
          <span className="ncp-project-placeholder">+ Search or select an SBU / project (PRJ-…)</span>
        )}
      </button>
      {projDdOpen &&
        projDdRect &&
        createPortal(
          <div
            ref={projPortalRef}
            className="ncp-dd-panel"
            style={{
              position: "fixed",
              top: projDdRect.top,
              left: projDdRect.left,
              width: projDdRect.width,
              zIndex: 9999,
            }}
          >
            <input
              className="ncp-dd-search"
              placeholder="Search projects…"
              value={projSearch}
              onChange={(e) => setProjSearch(e.target.value)}
              autoFocus
            />
            <div className="ncp-dd-scroll">
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cn("ncp-project-opt", String(p.id) === selectedProjectId && "ncp-selected")}
                  onClick={() => {
                    setSelectedProjectId(String(p.id));
                    setProjDdOpen(false);
                    setProjSearch("");
                  }}
                >
                  <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)", minWidth: 52 }}>
                    PRJ-{p.id}
                  </span>
                  <span>{p.engagement_name || p.account_name || p.filename || `Project ${p.id}`}</span>
                </button>
              ))}
              {filteredProjects.length === 0 && (
                <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                  No projects match “{projSearch}”
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );

  const displayName = clientVm?.officialName ?? "Client";
  const canSave = projects.length > 0 && !!selectedProject;

  return (
    <Sheet modal={false} open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "flex h-full max-h-[100dvh] flex-col gap-0 border-l p-0",
          "data-[side=right]:w-full data-[side=right]:max-w-[calc(100vw-1rem)]",
          "sm:data-[side=right]:w-[min(calc(100vw-2rem),56rem)] sm:data-[side=right]:max-w-[min(calc(100vw-2rem),56rem)]",
          "bg-[#f7f6f3] shadow-xl",
        )}
      >
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Clients</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>{canEditClient ? `CLI-${numericClientId}` : "Edit"}</span>
                  </div>
                  <h1 className="ncp-h1">Edit account</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    Update legal client fields and directory metadata for each linked SBU / project under {displayName}.
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={onClose}>
                  ✕
                </button>
              </div>

              {!projects.length ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ncp-text-secondary)" }}>No projects in scope.</p>
              ) : (
                <>
                  <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                    {CLIENT_TABS.map(({ icon, label }, i) => (
                      <button
                        key={label}
                        type="button"
                        role="tab"
                        aria-selected={tab === i}
                        className={cn("ncp-step", tab === i && "ncp-active", i < tab && "ncp-done")}
                        onClick={() => setTab(i)}
                      >
                        <span
                          className="ncp-step-num"
                          style={{
                            fontSize: 14,
                            background: tab === i ? "rgba(255,255,255,0.22)" : i < tab ? "var(--ncp-green)" : "var(--ncp-border)",
                            color: i < tab && tab !== i ? "#fff" : undefined,
                          }}
                        >
                          {i < tab ? "✓" : icon}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>
                    {section(
                      "🏢",
                      "ncp-blue",
                      "Legal client",
                      canEditClient
                        ? "Official name, lifecycle, and org directory tags on the clients table."
                        : "This view uses a legacy inferred client group — link projects to a legal client to edit these fields.",
                      canEditClient ? (
                        <>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Official name *</div>
                            <input
                              className="ncp-prop-input"
                              value={clientDraft.official_name}
                              onChange={(e) => setClient("official_name", e.target.value)}
                              disabled={saving}
                            />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Short code</div>
                              <input
                                className="ncp-prop-input"
                                value={clientDraft.short_code}
                                onChange={(e) => setClient("short_code", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Lifecycle</div>
                              <select
                                className="ncp-prop-input"
                                value={clientDraft.lifecycle_state}
                                onChange={(e) =>
                                  setClient("lifecycle_state", e.target.value as ClientDraft["lifecycle_state"])
                                }
                                disabled={saving}
                              >
                                <option value="active">Active</option>
                                <option value="prospect">Prospect</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">BU tag</div>
                              <input
                                className="ncp-prop-input"
                                value={clientDraft.hierarchy_tag_bu}
                                onChange={(e) => setClient("hierarchy_tag_bu", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">SBU tag</div>
                              <input
                                className="ncp-prop-input"
                                value={clientDraft.hierarchy_tag_sbu}
                                onChange={(e) => setClient("hierarchy_tag_sbu", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">SBG tag</div>
                              <input
                                className="ncp-prop-input"
                                value={clientDraft.hierarchy_tag_sbg}
                                onChange={(e) => setClient("hierarchy_tag_sbg", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">SBE tag</div>
                              <input
                                className="ncp-prop-input"
                                value={clientDraft.hierarchy_tag_sbe}
                                onChange={(e) => setClient("hierarchy_tag_sbe", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="ncp-hint" style={{ margin: 0 }}>
                          Project-level fields on the other tabs can still be saved. Create or assign a legal client via directory
                          ingest to unlock client record edits.
                        </p>
                      ),
                    )}
                  </div>

                  <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
                    {section("◇", "ncp-orange", "SBU / project identity", "Account labels and charge code for the selected project.", (
                      <>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Project *</div>
                          <div style={{ flex: 1, minWidth: 0 }}>{projectPicker}</div>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Account name</div>
                          <input
                            className="ncp-prop-input"
                            value={projectDraft.account_name}
                            onChange={(e) => setProject("account_name", e.target.value)}
                            disabled={saving || !selectedProject}
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Engagement name (SBU)</div>
                          <input
                            className="ncp-prop-input"
                            value={projectDraft.engagement_name}
                            onChange={(e) => setProject("engagement_name", e.target.value)}
                            disabled={saving || !selectedProject}
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Charge code</div>
                          <input
                            className="ncp-prop-input"
                            value={projectDraft.charge_code}
                            onChange={(e) => setProject("charge_code", e.target.value)}
                            disabled={saving || !selectedProject}
                          />
                        </div>
                        <DirectoryFieldSelect
                          label="Account status"
                          value={projectDraft.account_status}
                          options={directoryOptions.accountStatuses}
                          onChange={(v) => setProject("account_status", v)}
                          disabled={saving || !selectedProject}
                        />
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
                    {section("🌍", "ncp-teal", "Geography & segment", "Region, TARA category, vertical, and practice.", (
                      <>
                        <DirectoryFieldSelect
                          label="Sub region"
                          value={projectDraft.sub_region}
                          options={directoryOptions.subRegions}
                          onChange={(v) => setProject("sub_region", v)}
                          disabled={saving || !selectedProject}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <DirectoryFieldSelect
                            label="Category (TARA)"
                            value={projectDraft.category}
                            options={directoryOptions.categories}
                            onChange={(v) => setProject("category", v)}
                            disabled={saving || !selectedProject}
                          />
                          <DirectoryFieldSelect
                            label="Vertical / industry"
                            value={projectDraft.vertical}
                            options={directoryOptions.verticals}
                            onChange={(v) => setProject("vertical", v)}
                            disabled={saving || !selectedProject}
                          />
                        </div>
                        <DirectoryFieldSelect
                          label="Practice / account type"
                          value={projectDraft.practice}
                          options={directoryOptions.practices}
                          onChange={(v) => setProject("practice", v)}
                          disabled={saving || !selectedProject}
                        />
                        <p className="ncp-hint" style={{ marginTop: 4 }}>
                          Region and regional head are on the Leadership tab (shared with WFM rollups).
                        </p>
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>
                    {section(
                      "👤",
                      "ncp-blue",
                      "Account leadership",
                      "Function, practice, and regional heads — persisted on the project record.",
                      selectedProject ? (
                        <>
                          <WfmProjectOrgFields
                            draft={projectDraft.org}
                            onChange={(patch) =>
                              setProjectDraft((d) => ({ ...d, org: { ...d.org, ...patch } }))
                            }
                            users={orgUsers}
                            loadingUsers={loadingUsers}
                            disabled={saving}
                          />
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Project head (name)</div>
                            <input
                              className="ncp-prop-input"
                              value={projectDraft.project_head}
                              onChange={(e) => setProject("project_head", e.target.value)}
                              disabled={saving}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Project head (platform user)</div>
                            <UserPickerDropdown
                              value={projectDraft.project_head_user_id}
                              onChange={(v) => setProject("project_head_user_id", v)}
                              users={platformUsers}
                              placeholder="— Optional —"
                              disabled={saving || loadingUsers}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">BE SPOC</div>
                            <input
                              className="ncp-prop-input"
                              value={projectDraft.be_spoc}
                              onChange={(e) => setProject("be_spoc", e.target.value)}
                              disabled={saving}
                            />
                          </div>
                        </>
                      ) : (
                        <p className="ncp-hint">Select a project on the Project tab.</p>
                      ),
                    )}
                  </div>

                  <div className={cn("ncp-panel", tab === 4 && "ncp-panel-active")}>
                    {section(
                      "🔗",
                      "ncp-amber",
                      "Org hierarchy",
                      "Client → BU → SBU structure and directory tags on the project row.",
                      selectedProject ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Unit type</div>
                              <select
                                className="ncp-prop-input"
                                value={projectDraft.org_unit_kind}
                                onChange={(e) => setProject("org_unit_kind", e.target.value)}
                                disabled={saving}
                              >
                                <option value="business_unit">Business unit (BU)</option>
                                <option value="sub_business_unit">Sub-business unit (SBU)</option>
                              </select>
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Parent BU</div>
                              <select
                                className="ncp-prop-input"
                                value={projectDraft.parent_project_id}
                                onChange={(e) => setProject("parent_project_id", e.target.value)}
                                disabled={saving || projectDraft.org_unit_kind === "business_unit"}
                              >
                                <option value="">— None (top-level) —</option>
                                {buOptions.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    PRJ-{b.id} · {(b.engagement_name || b.account_name || "").slice(0, 36)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">BU tag</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.hierarchy_tag_bu}
                                onChange={(e) => setProject("hierarchy_tag_bu", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">SBU tag</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.hierarchy_tag_sbu}
                                onChange={(e) => setProject("hierarchy_tag_sbu", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">SBG tag</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.hierarchy_tag_sbg}
                                onChange={(e) => setProject("hierarchy_tag_sbg", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">SBE tag</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.hierarchy_tag_sbe}
                                onChange={(e) => setProject("hierarchy_tag_sbe", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="ncp-hint">Select a project on the Project tab.</p>
                      ),
                    )}
                  </div>

                  <div className={cn("ncp-panel", tab === 5 && "ncp-panel-active")}>
                    {section(
                      "📋",
                      "ncp-green",
                      "Tracker & revenue logic",
                      "Workbook sheet names, requisition ID column, and pinned revenue logic.",
                      selectedProject ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Tracker sheet</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.tracker_sheet}
                                onChange={(e) => setProject("tracker_sheet", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Contract sheet</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.contract_sheet}
                                onChange={(e) => setProject("contract_sheet", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Req ID column</div>
                            <input
                              className="ncp-prop-input"
                              placeholder="e.g. Req ID"
                              value={projectDraft.pos_id_column}
                              onChange={(e) => setProject("pos_id_column", e.target.value)}
                              disabled={saving}
                            />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Source workbook</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.filename}
                                onChange={(e) => setProject("filename", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <div className="ncp-prop-row">
                              <div className="ncp-prop-label">Source filename tag</div>
                              <input
                                className="ncp-prop-input"
                                value={projectDraft.source_filename}
                                onChange={(e) => setProject("source_filename", e.target.value)}
                                disabled={saving}
                              />
                            </div>
                          </div>
                          <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                            <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                              Revenue logic code
                            </div>
                            <textarea
                              className="ncp-prop-input"
                              value={projectDraft.revenue_logic_code}
                              onChange={(e) => setProject("revenue_logic_code", e.target.value)}
                              disabled={saving}
                              spellCheck={false}
                              style={{ minHeight: 120, fontFamily: "var(--ncp-mono)", fontSize: 12 }}
                            />
                          </div>
                          <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                            <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                              Logic explanation
                            </div>
                            <textarea
                              className="ncp-prop-input"
                              value={projectDraft.logic_explanation}
                              onChange={(e) => setProject("logic_explanation", e.target.value)}
                              disabled={saving}
                              style={{ minHeight: 72 }}
                            />
                          </div>
                        </>
                      ) : (
                        <p className="ncp-hint">Select a project on the Project tab.</p>
                      ),
                    )}
                  </div>

                  {error ? (
                    <div
                      style={{
                        margin: "12px 0 0",
                        padding: "10px 14px",
                        background: "rgba(239,68,68,0.07)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        borderRadius: "var(--ncp-radius)",
                        fontSize: 12,
                        color: "#b91c1c",
                      }}
                    >
                      {error}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="ncp-footer">
            <button type="button" className="ncp-btn ncp-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {tab > 0 && (
                <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setTab((t) => t - 1)} disabled={saving}>
                  ← Back
                </button>
              )}
              {tab < CLIENT_TABS.length - 1 && (
                <button type="button" className="ncp-btn ncp-btn-secondary" onClick={() => setTab((t) => t + 1)} disabled={saving}>
                  Next →
                </button>
              )}
              <button
                type="button"
                className="ncp-btn ncp-btn-primary"
                onClick={() => void submit()}
                disabled={saving || !canSave}
              >
                {saving ? "Saving…" : "Save changes ✓"}
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
