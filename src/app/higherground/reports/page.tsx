"use client";

import { Trash2, UserX } from "lucide-react";
import { api, useApiData } from "@/lib/admin-api";
import type { ReportDTO } from "@/lib/api-types";
import { Badge, Button, Card, EmptyState, LoadingScreen, PageHeader } from "@/components/admin/ui";
import { formatDate } from "@/lib/admin-utils";

export default function ReportsPage() {
  const { data: reports, error, reload } = useApiData(() =>
    api<{ reports: ReportDTO[] }>("/api/admin/reports?status=open").then((d) => d.reports),
  );

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Action failed");
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!reports) return <LoadingScreen />;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Flagged content awaiting review." />

      {reports.length === 0 ? (
        <EmptyState title="Nothing to review" body="No open reports right now." />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between gap-2">
                <Badge tone="danger">{r.targetType}</Badge>
                <span className="text-[12px] text-faint">{formatDate(r.createdAt)}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm">&ldquo;{r.excerpt}&rdquo;</p>
              {r.reason && <p className="mt-1 text-[13px] text-soft">Reason: {r.reason}</p>}
              <p className="mt-1 break-all text-[11px] text-faint">{r.targetPath}</p>
              <div className="mt-3 flex gap-2">
                {r.targetType !== "message" && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      const label = r.targetType === "member" ? "Remove this member?" : "Delete this content for everyone?";
                      if (window.confirm(label)) {
                        act(() => api(`/api/admin/reports/${r.id}/remove-target`, { method: "POST" }));
                      }
                    }}
                  >
                    {r.targetType === "member" ? (
                      <>
                        <UserX className="size-4" aria-hidden /> Remove member
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-4" aria-hidden /> Remove content
                      </>
                    )}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => act(() => api(`/api/admin/reports/${r.id}`, { method: "PATCH" }))}>
                  Dismiss
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
