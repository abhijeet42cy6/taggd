import { Link } from "react-router-dom";
import { UploadCloud } from "lucide-react";
import { isReadOnlyClient, useAuth } from "@/lib/auth";

type DataEmptyPanelProps = {
  title?: string;
  message?: string;
  /** When omitted, staff see ingestion link; read-only client users see contact-owner copy. */
  showIngestionLink?: boolean;
  className?: string;
};

export function DataEmptyPanel({
  title = "No data yet",
  message = "Tracker or finance rows have not been loaded for this view.",
  showIngestionLink,
  className,
}: DataEmptyPanelProps) {
  const { user } = useAuth();
  const readOnlyClient = isReadOnlyClient(user);
  const showIngest = showIngestionLink ?? !readOnlyClient;

  return (
    <div
      className={className}
      style={{
        border: "1px dashed var(--border)",
        borderRadius: 10,
        background: "var(--bg2)",
        padding: "28px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>{title}</div>
      <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-muted)", maxWidth: 420, margin: "0 auto 16px" }}>
        {message}
      </p>
      {showIngest ? (
        <Link
          to="/ingestion"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 8,
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 35%, var(--border))",
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <UploadCloud size={15} aria-hidden />
          Go to Ingestion Center
        </Link>
      ) : (
        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: 0 }}>
          Ask your programme owner to upload tracker data for your account.
        </p>
      )}
    </div>
  );
}
