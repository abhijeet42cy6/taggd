import React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth, canSeeCodeOfWorkByTheNumbers, type AuthUser } from "@/lib/auth";
import { CodeOfWorkLanding } from "@/components/CodeOfWorkLanding";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function codeOfWorkAudienceForUser(user: AuthUser | null): "cxo" | "non-cxo" {
  const er = (user?.effectiveRole ?? user?.role ?? "").trim().toLowerCase();
  return er === "executive" ? "cxo" : "non-cxo";
}

/** Mission & Vision — Code of Work as an in-app landing (platform-aligned; no iframe). */
export function CompanyValuesModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const audience = codeOfWorkAudienceForUser(user);
  const showByTheNumbers = canSeeCodeOfWorkByTheNumbers(user);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "platform-dialog grid max-h-[min(92vh,940px)] max-w-[min(98vw,1360px)] w-[min(98vw,1360px)] gap-0 overflow-hidden border border-[var(--border)] bg-[var(--surface-raised)] p-0 shadow-[var(--shadow-lg)]",
          "sm:max-w-[min(98vw,1360px)]",
        )}
      >
        <div className="flex shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-3.5 pr-14">
          <DialogTitle
            id="mission-vision-title"
            className="text-left font-[Syne,sans-serif] text-base font-semibold tracking-tight text-[var(--text)]"
          >
            Mission &amp; Vision — Code of Work
          </DialogTitle>
        </div>
        <div className="max-h-[min(88vh,900px)] min-h-[280px] overflow-y-auto overflow-x-hidden bg-white">
          <CodeOfWorkLanding audience={audience} showByTheNumbers={showByTheNumbers} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
