/**
 * Parse API errors from ingestion uploads (axios) and map known messages to user-facing hints.
 */

export type IngestionAxiosErrorMeta = { detail: string; status?: number };

/** Normalize FastAPI `detail` (string or validation array) for display + matching. */
export function captureIngestionAxiosError(err: unknown): IngestionAxiosErrorMeta | null {
  if (err == null || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  const res = e.response as Record<string, unknown> | undefined;
  const status = typeof res?.status === "number" ? res.status : undefined;
  let detail = res?.data != null && typeof res.data === "object" ? (res.data as Record<string, unknown>).detail : undefined;
  if (Array.isArray(detail)) {
    detail = detail
      .map((item: unknown) => {
        if (item && typeof item === "object" && "msg" in (item as object)) {
          return String((item as { msg?: string }).msg ?? JSON.stringify(item));
        }
        return typeof item === "string" ? item : JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail == null || detail === "") {
    const msg = typeof e.message === "string" ? e.message : "";
    if (!msg) return null;
    return { detail: msg, status };
  }
  return { detail: String(detail), status };
}

export type IngestionUserHints = { summary: string; hints: string[] };

/**
 * Returns extra guidance when the user can often fix the issue (rename file, fix sheet, align account names, etc.).
 */
export function getUserResolvableIngestionHints(detail: string, status?: number): IngestionUserHints | null {
  const d = detail.trim();
  const low = d.toLowerCase();

  const match = (predicate: () => boolean, out: IngestionUserHints): IngestionUserHints | null =>
    predicate() ? out : null;

  const chain: (() => IngestionUserHints | null)[] = [
    () =>
      match(
        () => low.includes("cannot create a new project"),
        {
          summary: "No existing project matched this file, and your role cannot create a new project automatically.",
          hints: [
            "Rename the file so it clearly matches an account or engagement name already in the app (same spelling the matchmaker expects).",
            "Ask a platform admin or executive to create the project first, or to run the upload if they are allowed to auto-create projects.",
          ],
        },
      ),
    () =>
      match(
        () => low.includes("access denied for this project"),
        {
          summary: "The system linked this workbook to a project you are not assigned to (or the wrong project was inferred).",
          hints: [
            "Rename the file so it matches one of your assigned projects’ account or filename conventions.",
            "If the match is wrong, adjust the name to steer matching toward the correct account, then upload again.",
            "If you should have access, ask an administrator to add you to that project.",
          ],
        },
      ),
    () =>
      match(
        () => low.includes("access denied for this account") || low.includes("access denied for this client"),
        {
          summary: "The client or account in the file does not match what your login is allowed to see.",
          hints: [
            "Align names in the spreadsheet (e.g. Project / account columns) with official names in the platform.",
            "Remove stray spaces, SBU suffixes, or alternate spellings that prevent matching.",
            "If the account is correct but you still see this, ask an administrator to confirm your project scope.",
          ],
        },
      ),
    () =>
      match(
        () => low.includes("user disabled") || low.includes("insufficient permissions"),
        {
          summary: "Your account cannot perform this action.",
          hints: ["Contact an administrator to re-enable your user or adjust your role.", "Sign out and back in if your permissions were recently updated."],
        },
      ),
    () =>
      match(
        () => low.includes("not authenticated"),
        {
          summary: "Your session is missing or no longer valid.",
          hints: ["Sign in again, then retry the upload.", "If you use multiple tabs, refresh this tab before uploading."],
        },
      ),
    () =>
      match(
        () => low.includes("upload an excel file"),
        {
          summary: "This endpoint expects an Excel workbook.",
          hints: ["Save or export the file as .xlsx (or .xlsm / .xls if your template requires it), then upload again.", "Avoid CSV or Google Sheets direct export without saving as Excel first."],
        },
      ),
    () =>
      match(
        () => low.includes("workbook has no sheets"),
        {
          summary: "The file could not be read as a normal Excel workbook.",
          hints: ["Re-open the file in Excel and save as .xlsx.", "Ensure the file is not corrupted, password-protected in a way that blocks reading, or empty."],
        },
      ),
    () =>
      match(
        () => low.includes("temporary file lost") || low.includes("please re-upload"),
        {
          summary: "The server no longer has the temporary copy from your inspection step.",
          hints: ["Go back to Pro step 1, upload the workbook again, then confirm sheets in step 2.", "Complete confirm shortly after inspect so the temp file is still present."],
        },
      ),
    () =>
      match(
        () => low.includes("project not found"),
        {
          summary: "The referenced project no longer exists or the ID is invalid.",
          hints: ["Refresh the page and repeat the Pro inspect flow from step 1.", "If you changed environments, ensure you are using the same database / deployment as before."],
        },
      ),
    () =>
      match(
        () => low.includes("missing required fields"),
        {
          summary: "The confirm request was incomplete.",
          hints: ["Select at least one data sheet and a contract sheet, then confirm again.", "If the problem persists, restart from Pro inspect (re-upload)."],
        },
      ),
    () =>
      match(
        () => low.includes("base file") && (low.includes("not found") || low.includes("worksheet")),
        {
          summary: "The SLA master is missing the required sheet name.",
          hints: [
            "In Excel, rename the main data sheet to exactly `Base File` (case and spacing as shown).",
            "If the sheet exists under another name, copy the grid into a new sheet named `Base File` and upload that workbook.",
          ],
        },
      ),
    () =>
      match(
        () => low.includes("provide at least one file"),
        {
          summary: "Revenue template ingest needs at least one workbook.",
          hints: ["Attach the weekly forecast file and/or the visibility file, then run ingest again.", "Use the templates described in the UI (correct sheet names inside the workbook)."],
        },
      ),
    () =>
      match(
        () =>
          low.includes("locked under the revenue pack") ||
          low.includes("submitted or approved") ||
          low.includes("weekly pack is submitted"),
        {
          summary: "This week’s revenue pack is locked in workflow.",
          hints: ["Wait for an approver to unlock or reject the pack, or use an account with permission to edit locked weeks.", "If you only need a dry run, coordinate with finance / ops on process."],
        },
      ),
    () =>
      match(
        () => low.includes("contract sheet") && low.includes("not found"),
        {
          summary: "The workbook does not contain the contract sheet the pipeline expected.",
          hints: ["Rename the contract tab to match the suggested name, or use Pro path to pick the correct contract sheet.", "Ensure hidden or very similar duplicate sheet names are not confusing the reader."],
        },
      ),
    () =>
      match(
        () => low.includes("no tracker/data sheet identified"),
        {
          summary: "The AI could not find a tracker-style sheet in this workbook.",
          hints: ["Add or rename a sheet so a typical requisition/placement grid is obvious (headers like Req ID, Position, Status).", "Try the Pro path to manually designate data and contract sheets."],
        },
      ),
    () =>
      match(
        () => low.includes("failed to execute synthesized code") || low.includes("synthesized code"),
        {
          summary: "Generated revenue logic failed when run against your rows.",
          hints: [
            "Check the contract sheet and tracker sheet for unusual blanks, merged cells, or non-tabular blocks.",
            "Simplify the first data rows so headers and samples look like a standard tracker, then re-upload.",
            "Use Pro inspect to pin different sheets if the wrong contract tab was chosen.",
          ],
        },
      ),
    () =>
      match(
        () => low.includes("date must be yyyy-mm-dd") || low.includes("invalid calendar date"),
        {
          summary: "A date field is not in the required ISO format.",
          hints: ["Use YYYY-MM-DD for week anchors and as-of dates in templates.", "Avoid locale-specific date text in cells the parser reads as dates."],
        },
      ),
    () =>
      match(
        () => /account|client|project|engagement/i.test(d) && /unknown|unmatched|not found|no matching|could not resolve|unable to match|does not exist/i.test(d),
        {
          summary: "A name in the file did not resolve to data you can write to.",
          hints: [
            "Align account or client spelling with directory / finance naming in the platform.",
            "For SLA rows, check the `Project` column matches an existing project’s account name.",
            "Rename the upload file if Express / Pro matching depends on the filename.",
          ],
        },
      ),
    () =>
      match(
        () => /sheet|worksheet|column|header|row|cell|missing|invalid|expected|parse|read_excel/i.test(d) && status === 400,
        {
          summary: "The workbook structure or values did not pass a validation step.",
          hints: [
            "Read the message literally — it often names a sheet, column, or required label.",
            "Compare against the documented template for this ingest (sheet names and header row).",
            "Re-save as .xlsx from Excel after fixing structure.",
          ],
        },
      ),
  ];

  for (const fn of chain) {
    const out = fn();
    if (out) return out;
  }

  if (status === 403) {
    return {
      summary: "Access was denied.",
      hints: [
        "Confirm you are using the correct login and that your role may run this ingest.",
        "For scoped users, ensure the file name and contents line up with projects you are assigned to.",
        "Ask an administrator if you believe your access should include this upload.",
      ],
    };
  }

  if (status === 400 && d.length > 0) {
    return {
      summary: "The server rejected this upload (validation or format).",
      hints: [
        "Use the exact error text above — fix the named sheet, column, or value, then try again.",
        "When in doubt, re-export from the official template and copy only data (not formatting blocks) across.",
      ],
    };
  }

  if (status === 401) {
    return {
      summary: "Authentication failed.",
      hints: ["Sign in again and retry.", "If your token expired, refresh the page before uploading large files."],
    };
  }

  if (status === 422 || status === 423) {
    return {
      summary: "The request was rejected by a business rule (not always fixable by file edits alone).",
      hints: ["Read the server message — it may describe a locked period or invalid payload.", "Coordinate with ops or an admin if the workflow must be unlocked."],
    };
  }

  if (status === 404) {
    return {
      summary: "The server could not find a referenced record.",
      hints: ["Refresh the app and repeat any prior step (e.g. Pro inspect) so IDs stay in sync.", "Confirm you are on the correct environment / tenant."],
    };
  }

  if (status === 500 && d.length > 0) {
    if (/excel|openpyxl|sheet|read_excel|worksheet|column|nan|dtype/i.test(d)) {
      return {
        summary: "Processing failed while reading or interpreting the spreadsheet.",
        hints: [
          "Open the file in Excel, fix any sheet/column issues hinted at in the message, and save again as .xlsx.",
          "Remove extreme merged regions or non-tabular content from data sheets.",
          "Retry; if the message is unchanged, share the filename and exact time with support.",
        ],
      };
    }
  }

  return null;
}

export function truncateIngestionDetail(detail: string, maxLen = 600): string {
  const t = detail.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}
