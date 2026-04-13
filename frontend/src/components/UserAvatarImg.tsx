import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Props = {
  userId: number | undefined;
  hasAvatar: boolean | undefined;
  /** Shown while loading or when no avatar */
  fallback: React.ReactNode;
  size: number;
  borderRadius?: string | number;
};

/**
 * Loads GET /auth/me/avatar with Bearer (axios) and shows a blob URL — plain <img src> cannot send auth.
 */
export function UserAvatarImg({ userId, hasAvatar, fallback, size, borderRadius = "50%" }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const revoke = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setBlobUrl(null);
    };

    if (!userId || !hasAvatar) {
      revoke();
      return () => {
        cancelled = true;
      };
    }

    revoke();

    (async () => {
      try {
        const r = await api.get("/auth/me/avatar", { responseType: "blob" });
        if (cancelled) return;
        const u = URL.createObjectURL(r.data);
        urlRef.current = u;
        setBlobUrl(u);
      } catch {
        if (!cancelled) revoke();
      }
    })();

    return () => {
      cancelled = true;
      revoke();
    };
  }, [userId, hasAvatar]);

  if (!blobUrl) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={blobUrl}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius,
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}
