import React from "react";
import type { Project, ProjectContractRow } from "@/lib/api";
import { columnMappingEntryCount } from "@/lib/api";
import type { ClientVm } from "@/lib/view-models/clients";
import { ColumnMappingDisplay } from "@/components/ColumnMappingDisplay";
import {
  KvRow,
  PlatformSection,
  StatusTag,
} from "@/components/platform/PlatformBlocks";
import { SkeletonTable } from "@/components/platform/Skeleton";
import {
  AccountMetricCard,
  ClientMetricGrid,
  platformAccentToDecoration,
} from "@/components/tremor-dashboard/AccountMetricCard";
import { cn, formatCurrency } from "@/lib/utils";
import "@/styles/new-contract-panel.css";

function dash(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s && s.toLowerCase() !== "nan" ? s : "—";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("en-IN");
}

function orgUnitLabel(kind: string | null | undefined): string {
  if (kind === "business_unit") return "Business unit (BU)";
  if (kind === "sub_business_unit") return "Sub-business unit (SBU)";
  return "SBU (legacy)";
}

/** When all projects share the same value, show it; otherwise summarize variance. */
function rollupText(projects: Project[], pick: (p: Project) => string | null | undefined): string {
  if (!projects.length) return "—";
  const vals = [...new Set(projects.map((p) => dash(pick(p))).filter((v) => v !== "—"))];
  if (vals.length === 0) return "—";
  if (vals.length === 1) return vals[0];
  return `${vals.length} values`;
}

function rollupField(projects: Project[], pick: (p: Project) => string | null | undefined): React.ReactNode {
  if (!projects.length) return "—";
  const vals = [...new Set(projects.map((p) => dash(pick(p))).filter((v) => v !== "—"))];
  if (vals.length === 0) return "—";
  if (vals.length === 1) return vals[0];
  return (
    <span title={vals.join(" · ")}>
      {vals.length} values
      <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
        {" "}
        ({vals.slice(0, 2).join(", ")}
        {vals.length > 2 ? "…" : ""})
      </span>
    </span>
  );
}

function AccountSectionDivider({ label }: { label: string }) {
  return (
    <div
      className="client-account-section-divider"
      style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 10px" }}
    >
      <span className="client-account-section-label">{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

function InfoSection({
  icon,
  iconTone,
  title,
  desc,
  children,
}: {
  icon: string;
  iconTone: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ncp-section" style={{ marginBottom: 0, height: "100%" }}>
      <div className="ncp-section-header" style={{ cursor: "default", pointerEvents: "none" }}>
        <div className={cn("ncp-section-icon", iconTone)}>{icon}</div>
        <div>
          <div className="ncp-section-label">{title}</div>
          {desc ? <div className="ncp-section-desc">{desc}</div> : null}
        </div>
      </div>
      <div className="ncp-section-body" style={{ maxHeight: "none" }}>
        {children}
      </div>
    </div>
  );
}

export type ClientAccountInfoTabProps = {
  clientVm: ClientVm | null;
  loadingMeta: boolean;
  loadingContracts: boolean;
  contractsByProject: Map<number, ProjectContractRow[]>;
  numericClientId: number | null;
  displayClientName: string;
  onRefreshProjects: () => void | Promise<void>;
  renderHierarchyEditor: (props: {
    project: Project;
    siblingProjects: Project[];
    onSaved: () => void | Promise<void>;
  }) => React.ReactNode;
  renderRevenueLogic: (project: Project) => React.ReactNode;
};

function ProjectCard({
  project,
  siblingProjects,
  numericClientId,
  onSavedHierarchy,
  renderHierarchyEditor,
}: {
  project: Project;
  siblingProjects: Project[];
  numericClientId: number | null;
  onSavedHierarchy: () => void | Promise<void>;
  renderHierarchyEditor: ClientAccountInfoTabProps["renderHierarchyEditor"];
}) {
  const title = (project.engagement_name || project.account_name || project.filename || `Project ${project.id}`).trim();
  const parentLabel =
    project.parent_project_id != null ? `Parent PRJ-${project.parent_project_id}` : "Top-level unit";

  return (
    <div
      className="client-account-project-card"
      style={{
        padding: "14px 16px",
        background: "var(--bg2)",
        borderRadius: 10,
        border: "1px solid var(--border)",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font)", color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
            PRJ-{project.id}
            {title ? ` · ${title}` : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {project.account_status ? <StatusTag status={project.account_status} /> : null}
            {project.region ? (
              <span className="platform-badge" style={{ fontSize: 10 }}>
                {project.region}
                {project.sub_region ? ` · ${project.sub_region}` : ""}
              </span>
            ) : null}
            {project.vertical ? (
              <span className="platform-badge amber" style={{ fontSize: 10 }}>
                {project.vertical}
              </span>
            ) : null}
            {project.has_taggd_joiner_sheet ? (
              <span className="platform-badge green" style={{ fontSize: 10 }}>
                Taggd joiner cohort
              </span>
            ) : null}
          </div>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font)" }}>
          {fmtDate(project.system_created_at)}
        </span>
      </div>

      <div className="platform-grid-2" style={{ gap: 12 }}>
        <div>
          <AccountSectionDivider label="Identity" />
          <KvRow label="Account name" value={dash(project.account_name)} />
          <KvRow label="Engagement name" value={dash(project.engagement_name)} />
          <KvRow label="Charge code" value={dash(project.charge_code)} />
          <KvRow label="Source file" value={dash(project.filename)} />
          <KvRow label="Client link" value={project.client_id != null ? `CLI-${project.client_id}` : "—"} />
        </div>
        <div>
          <AccountSectionDivider label="Geography & segment" />
          <KvRow label="Region" value={dash(project.region)} />
          <KvRow label="Sub region" value={dash(project.sub_region)} />
          <KvRow label="Category (TARA)" value={dash(project.category)} />
          <KvRow label="Vertical / industry" value={dash(project.vertical)} />
          <KvRow label="Practice / account type" value={dash(project.practice)} />
        </div>
      </div>

      <div className="platform-grid-2" style={{ gap: 12, marginTop: 4 }}>
        <div>
          <AccountSectionDivider label="Leadership" />
          <KvRow label="Function head" value={dash(project.function_head)} />
          <KvRow label="Regional head" value={dash(project.regional_head)} />
          <KvRow label="Practice head" value={dash(project.practice_head)} />
          <KvRow label="Project head" value={dash(project.project_head)} />
          <KvRow label="BE SPOC" value={dash(project.be_spoc)} />
          {project.project_head_user_id != null ? (
            <KvRow label="Project head (user id)" value={String(project.project_head_user_id)} />
          ) : null}
        </div>
        <div>
          <AccountSectionDivider label="Tracker & ingest" />
          <KvRow label="Tracker sheet" value={dash(project.tracker_sheet)} />
          <KvRow label="Contract sheet" value={dash(project.contract_sheet)} />
          <KvRow label="Req ID column" value={dash(project.pos_id_column)} />
          <KvRow label="Org unit" value={orgUnitLabel(project.org_unit_kind)} />
          <KvRow label="Hierarchy parent" value={parentLabel} />
          <KvRow
            label="Revenue logic"
            value={project.revenue_logic_code ? "Pinned on project" : "Not configured"}
            valueColor={project.revenue_logic_code ? "var(--green)" : "var(--amber)"}
          />
        </div>
      </div>

      {(project.hierarchy_tag_bu ||
        project.hierarchy_tag_sbu ||
        project.hierarchy_tag_sbg ||
        project.hierarchy_tag_sbe) && (
        <>
          <AccountSectionDivider label="Org directory tags (project)" />
          <div className="platform-grid-2" style={{ gap: 0 }}>
            <KvRow label="BU tag" value={dash(project.hierarchy_tag_bu)} />
            <KvRow label="SBU tag" value={dash(project.hierarchy_tag_sbu)} />
            <KvRow label="SBG tag" value={dash(project.hierarchy_tag_sbg)} />
            <KvRow label="SBE tag" value={dash(project.hierarchy_tag_sbe)} />
          </div>
        </>
      )}

      {numericClientId != null && numericClientId > 0
        ? renderHierarchyEditor({ project, siblingProjects, onSaved: onSavedHierarchy })
        : null}

      {project.column_mapping && columnMappingEntryCount(project.column_mapping) > 0 ? (
        <details style={{ marginTop: 12 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "'DM Mono',monospace",
              color: "var(--accent)",
            }}
          >
            Column mapping ({columnMappingEntryCount(project.column_mapping)} links)
          </summary>
          <div
            style={{
              marginTop: 10,
              padding: "10px 8px",
              background: "var(--bg)",
              borderRadius: 6,
              border: "1px solid var(--border)",
            }}
          >
            <ColumnMappingDisplay mapping={project.column_mapping} variant="card" scrollMaxClass="max-h-[320px]" />
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function ClientAccountInfoTab({
  clientVm,
  loadingMeta,
  loadingContracts,
  contractsByProject,
  numericClientId,
  displayClientName,
  onRefreshProjects,
  renderHierarchyEditor,
  renderRevenueLogic,
}: ClientAccountInfoTabProps) {
  const projects = clientVm?.projects ?? [];
  const primary = projects[0];

  const structureLabel = !clientVm
    ? "—"
    : clientVm.id >= 0 && clientVm.split
      ? `Legal client · ${projects.length} SBUs`
      : clientVm.id >= 0
        ? "Single SBU under legal client"
        : clientVm.split
          ? `Inferred rollup · ${projects.length} projects`
          : "Single project (legacy URL)";

  return (
    <div className="client-account-info" style={{ display: "grid", gap: 16 }}>
      {!loadingMeta && clientVm && projects.length > 0 ? (
        <ClientMetricGrid count={4}>
          <AccountMetricCard
            eyebrow="Legal client"
            value={displayClientName}
            decorationColor={platformAccentToDecoration("blue")}
            hint={clientVm.id >= 0 ? `CLI-${clientVm.id}` : "Inferred client group"}
            subtext={clientVm.shortCode ? `Short code · ${clientVm.shortCode}` : structureLabel}
          />
          <AccountMetricCard
            eyebrow="Geography"
            value={rollupText(projects, (p) => p.sub_region || p.region)}
            decorationColor={platformAccentToDecoration("teal")}
            subtext={`Region · ${rollupText(projects, (p) => p.region)}`}
          />
          <AccountMetricCard
            eyebrow="Segment"
            value={rollupText(projects, (p) => p.vertical)}
            decorationColor={platformAccentToDecoration("amber")}
            hint={`Category · ${rollupText(projects, (p) => p.category)}`}
            subtext={`Practice · ${rollupText(projects, (p) => p.practice)}`}
          />
          <AccountMetricCard
            eyebrow="Operating status"
            value={rollupText(projects, (p) => p.account_status)}
            decorationColor={platformAccentToDecoration(
              (primary?.account_status || "").toLowerCase().includes("active") ? "green" : "amber",
            )}
            subtext={`${projects.length} linked project${projects.length > 1 ? "s" : ""}`}
            footnote={
              clientVm.lifecycleState === "prospect"
                ? "Client lifecycle · Prospect"
                : clientVm.id >= 0
                  ? "Client lifecycle · Active"
                  : undefined
            }
          />
        </ClientMetricGrid>
      ) : null}

      <div className="new-contract-sheet rt-scope-ncp-host" style={{ minHeight: 0, height: "auto", display: "block" }}>
        <div className="platform-grid-2" style={{ gap: 14, alignItems: "stretch" }}>
          <PlatformSection title="Legal client & directory">
            {loadingMeta ? (
              <SkeletonTable rows={8} cols={2} />
            ) : (
              <InfoSection
                icon="🏢"
                iconTone="ncp-blue"
                title="Client record"
                desc="Legal entity and org-chart tags from the clients table."
              >
                <KvRow label="Official name" value={displayClientName} />
                {clientVm && clientVm.id >= 0 ? (
                  <>
                    <KvRow label="Client ID" value={`CLI-${clientVm.id}`} />
                    <KvRow
                      label="Lifecycle"
                      value={
                        clientVm.lifecycleState === "prospect" ? (
                          <span className="platform-badge amber">Prospect</span>
                        ) : (
                          <span className="platform-badge green">Active</span>
                        )
                      }
                    />
                    <KvRow label="Short code" value={dash(clientVm.shortCode)} />
                  </>
                ) : (
                  <KvRow label="Client ID" value="Inferred (legacy URL)" />
                )}
                <KvRow label="Portfolio structure" value={structureLabel} />
                <AccountSectionDivider label="Org tags (client level)" />
                <KvRow label="BU" value={dash(clientVm?.hierarchyTagBu)} />
                <KvRow label="SBU" value={dash(clientVm?.hierarchyTagSbu)} />
                <KvRow label="SBG" value={dash(clientVm?.hierarchyTagSbg)} />
                <KvRow label="SBE" value={dash(clientVm?.hierarchyTagSbe)} />
              </InfoSection>
            )}
          </PlatformSection>

          <PlatformSection title="Account rollup (scoped projects)">
            {loadingMeta ? (
              <SkeletonTable rows={10} cols={2} />
            ) : (
              <InfoSection
                icon="◇"
                iconTone="ncp-orange"
                title="Commercial & geography"
                desc="Merged view across SBUs you can access — shows one value or notes variance."
              >
                <KvRow label="Charge code" value={rollupField(projects, (p) => p.charge_code)} />
                <KvRow label="Account status" value={rollupField(projects, (p) => p.account_status)} />
                <KvRow label="Region" value={rollupField(projects, (p) => p.region)} />
                <KvRow label="Sub region" value={rollupField(projects, (p) => p.sub_region)} />
                <KvRow label="Category (TARA bucket)" value={rollupField(projects, (p) => p.category)} />
                <KvRow label="Vertical" value={rollupField(projects, (p) => p.vertical)} />
                <KvRow label="Practice" value={rollupField(projects, (p) => p.practice)} />
                <AccountSectionDivider label="Accountability" />
                <KvRow label="Function head" value={rollupField(projects, (p) => p.function_head)} />
                <KvRow label="Regional head" value={rollupField(projects, (p) => p.regional_head)} />
                <KvRow label="Practice head" value={rollupField(projects, (p) => p.practice_head)} />
                <KvRow label="Project head" value={rollupField(projects, (p) => p.project_head)} />
                <KvRow label="BE SPOC" value={rollupField(projects, (p) => p.be_spoc)} />
                <KvRow label="Taggd joiner sheet" value={projects.some((p) => p.has_taggd_joiner_sheet) ? "Yes (≥1 SBU)" : "No"} />
              </InfoSection>
            )}
          </PlatformSection>
        </div>
      </div>

      <PlatformSection title="Ingest & tracker defaults">
        {loadingMeta ? (
          <SkeletonTable rows={4} cols={2} />
        ) : primary ? (
          <div className="platform-grid-2">
            <KvRow
              label="Tracker sheet"
              value={projects.length === 1 ? dash(primary.tracker_sheet) : rollupField(projects, (p) => p.tracker_sheet)}
            />
            <KvRow
              label="Contract sheet"
              value={projects.length === 1 ? dash(primary.contract_sheet) : rollupField(projects, (p) => p.contract_sheet)}
            />
            <KvRow
              label="Req ID column"
              value={projects.length === 1 ? dash(primary.pos_id_column) : rollupField(projects, (p) => p.pos_id_column)}
            />
            <KvRow
              label="Source workbook"
              value={projects.length === 1 ? dash(primary.filename) : `${projects.length} files`}
            />
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>No projects in scope.</div>
        )}
      </PlatformSection>

      <PlatformSection title={`SBU / linked projects (${projects.length})`}>
        {loadingMeta ? (
          <SkeletonTable rows={6} cols={2} />
        ) : projects.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>No projects linked to this client.</div>
        ) : (
          projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              siblingProjects={projects}
              numericClientId={numericClientId}
              onSavedHierarchy={onRefreshProjects}
              renderHierarchyEditor={renderHierarchyEditor}
            />
          ))
        )}
      </PlatformSection>

      {projects.map((p) => (
        <React.Fragment key={`logic-${p.id}`}>{renderRevenueLogic(p)}</React.Fragment>
      ))}

      <PlatformSection title="Commercial contracts">
        {loadingContracts ? (
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading contract rows…</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {projects.map((p) => {
              const rows = contractsByProject.get(p.id) ?? [];
              return (
                <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <div
                    style={{
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 10,
                      color: "var(--accent)",
                      marginBottom: 8,
                    }}
                  >
                    PRJ-{p.id}
                    {(p.engagement_name || p.account_name) ? ` · ${p.engagement_name || p.account_name}` : ""}
                  </div>
                  {rows.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      No contract record — ingest workbook or add via Contract management.
                    </div>
                  ) : (
                    <div className="platform-table-wrap">
                      <table className="platform-table">
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>Type</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>ACV (INR)</th>
                            <th>CM%</th>
                            <th>HC</th>
                            <th>Pipeline</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((c) => (
                            <tr key={c.id}>
                              <td>{c.customer_name ?? "—"}</td>
                              <td>{c.contract_status ?? "—"}</td>
                              <td>{c.account_type ?? "—"}</td>
                              <td style={{ fontSize: 10, fontFamily: "'DM Mono',monospace" }}>
                                {c.contract_start_date?.slice(0, 10) ?? "—"}
                              </td>
                              <td style={{ fontSize: 10, fontFamily: "'DM Mono',monospace" }}>
                                {c.contract_end_date?.slice(0, 10) ?? "—"}
                              </td>
                              <td>{c.signed_acv_inr != null ? formatCurrency(c.signed_acv_inr) : "—"}</td>
                              <td>
                                {c.signed_cm_pct != null ? `${Math.round(c.signed_cm_pct * 10000) / 100}%` : "—"}
                              </td>
                              <td>{c.headcount_contracted != null ? String(c.headcount_contracted) : "—"}</td>
                              <td>{c.pipeline_stage ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PlatformSection>
    </div>
  );
}
