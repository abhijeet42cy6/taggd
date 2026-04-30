import type { ReactNode } from "react";
import { Title } from "@tremor/react";

export function ExecSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="exec-dash-tremor__section-head">
      <span className="exec-dash-tremor__section-accent" aria-hidden />
      <Title className="text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">{children}</Title>
    </div>
  );
}
