import React, { useEffect } from "react";
import { createPortal } from "react-dom";

type PlatformDrawerProps = {
  open: boolean;
  title: React.ReactNode;
  /** Secondary line under the title (e.g. project id) */
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
  /** Extra classes on the aside (e.g. platform-drawer--wide) */
  className?: string;
  /** e.g. Edit / Cancel — rendered next to Close */
  headerActions?: React.ReactNode;
  /** Sticky bottom bar (e.g. Save) — body scrolls independently */
  footer?: React.ReactNode;
  /**
   * When true, hides the default drawer chrome (title row + text Close).
   * Children should render a full `new-contract-sheet` layout (breadcrumb, ✕, footer inside sheet if needed).
   */
  embeddedChrome?: boolean;
};

export function PlatformDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  width,
  className,
  headerActions,
  footer,
  embeddedChrome = false,
}: PlatformDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const shell = (
    <>
      <div
        className="platform-drawer-overlay"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`platform-drawer${footer ? " platform-drawer--footer" : ""}${embeddedChrome ? " platform-drawer--ncp-embed" : ""}${className ? ` ${className}` : ""}`}
        style={{
          ...(width ? { width } : {}),
          minWidth: 0,
          maxWidth: "100vw",
          boxSizing: "border-box",
        }}
        role="dialog"
        aria-modal="true"
      >
        {!embeddedChrome ? (
          <div className="platform-drawer-head">
            <div className="platform-drawer-head-row">
              <div className="platform-drawer-head-text">
                <h3 className="platform-drawer-title">{title}</h3>
                {subtitle ? <div className="platform-drawer-subtitle">{subtitle}</div> : null}
              </div>
              <div className="platform-drawer-head-actions">
                {headerActions}
                <button type="button" className="platform-drawer-close" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className={`platform-drawer-body${embeddedChrome ? " platform-drawer-body--ncp-embed" : ""}`}>{children}</div>
        {footer ? <div className="platform-drawer-footer">{footer}</div> : null}
      </aside>
    </>
  );

  return createPortal(shell, document.body);
}

