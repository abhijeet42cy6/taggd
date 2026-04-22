import React from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth, type AuthUser } from "@/lib/auth";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function codeOfWorkAudienceForUser(user: AuthUser | null): "cxo" | "non-cxo" {
  const er = (user?.effectiveRole ?? user?.role ?? "").trim().toLowerCase();
  return er === "executive" ? "cxo" : "non-cxo";
}

/** Full “Code of Work” experience from `dashboard_exp/webapp 5` (static `public/taggd-code-of-work.html`). */
export function CompanyValuesModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const audience = codeOfWorkAudienceForUser(user);
  const iframeSrc = `/taggd-code-of-work.html?audience=${encodeURIComponent(audience)}&lock=1`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "platform-dialog grid max-h-[90vh] max-w-[min(96vw,1180px)] w-[min(96vw,1180px)] gap-0 overflow-hidden border border-[var(--border)] bg-[var(--surface-raised)] p-0 shadow-[var(--shadow-lg)]",
          "sm:max-w-[min(96vw,1180px)]",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 pr-14">
          <DialogTitle
            id="mission-vision-title"
            className="text-left font-[Syne,sans-serif] text-base font-semibold text-[var(--text)]"
          >
            Mission &amp; Vision — Code of Work
          </DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              className="shrink-0 bg-[var(--accent)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)]"
            >
              Close
            </Button>
          </DialogClose>
        </div>
        <iframe
          key={`code-of-work-${user?.id ?? "guest"}-${audience}`}
          src={iframeSrc}
          title="Taggd Code of Work — Mission and Vision"
          className="h-[min(82vh,860px)] w-full min-h-[320px] border-0 bg-white"
          sandbox="allow-scripts allow-same-origin"
        />
      </DialogContent>
    </Dialog>
  );
}
