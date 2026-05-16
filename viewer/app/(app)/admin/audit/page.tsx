// viewer/app/(app)/admin/audit/page.tsx
// brand_audit_log 전체 조회 (admin 전용).
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface AuditRow {
  id: string;
  brand_name: string;
  brand_slug: string;
  action: string;
  old_company_name: string | null;
  new_company_name: string | null;
  actor: string;
  source: string;
  reasoning: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  add: "추가",
  remove: "제거",
  reassign: "재매핑",
};

const SOURCE_LABEL: Record<string, string> = {
  manual_ui: "수동",
  bulk_csv: "CSV",
  llm_enrich: "LLM",
  seed: "시드",
  scraper: "스크래퍼",
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const perPage = 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const admin = supabaseAdmin();
  const {
    data: rows,
    count,
    error,
  } = await admin
    .from("brand_audit_log")
    .select(
      "id, brand_name, brand_slug, action, old_company_name, new_company_name, actor, source, reasoning, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <main className="max-w-[1280px] mx-auto px-10 py-10">
        <p className="text-sm text-red-500">데이터 조회 오류: {error.message}</p>
      </main>
    );
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / perPage);
  const logs = (rows ?? []) as AuditRow[];

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      <h1 className="text-xl font-semibold text-fg-primary mb-2">감사 로그</h1>
      <p className="text-sm text-fg-tertiary mb-8">
        brand_audit_log · 총 {total.toLocaleString()}건 · {perPage}/페이지
      </p>

      <div className="bg-raised border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-fg-tertiary text-xs font-medium uppercase tracking-wide">
              <th className="text-left px-4 py-3">시각</th>
              <th className="text-left px-4 py-3">행위자</th>
              <th className="text-left px-4 py-3">액션</th>
              <th className="text-left px-4 py-3">브랜드</th>
              <th className="text-left px-4 py-3">변경 내용</th>
              <th className="text-left px-4 py-3">출처</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border-hair last:border-0 hover:bg-canvas/50"
              >
                <td className="px-4 py-3 text-fg-tertiary font-mono text-xs whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("ko-KR", {
                    year: "2-digit",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3 text-fg-secondary text-xs font-mono">
                  {row.actor}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-sunken border border-border-hair text-fg-secondary">
                    {ACTION_LABEL[row.action] ?? row.action}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-fg-primary font-medium">
                    {row.brand_name}
                  </span>
                  <span className="ml-1.5 text-xs text-fg-quaternary font-mono">
                    {row.brand_slug}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg-secondary text-xs">
                  {row.action === "remove" ? (
                    <span>
                      <span className="text-fg-quaternary">
                        {row.old_company_name}
                      </span>{" "}
                      → 해제
                    </span>
                  ) : (
                    <span>
                      {row.old_company_name && (
                        <>
                          <span className="text-fg-quaternary">
                            {row.old_company_name}
                          </span>{" "}
                          →{" "}
                        </>
                      )}
                      {row.new_company_name}
                    </span>
                  )}
                  {row.reasoning && (
                    <p className="text-fg-quaternary mt-0.5 truncate max-w-xs">
                      {row.reasoning}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-fg-quaternary">
                  {SOURCE_LABEL[row.source] ?? row.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 text-sm text-fg-tertiary">
          {page > 1 && (
            <a
              href={`/admin/audit?page=${page - 1}`}
              className="px-3 py-1 border border-border rounded hover:text-fg-primary hover:border-border-strong transition-colors"
            >
              이전
            </a>
          )}
          <span className="font-mono text-xs">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/admin/audit?page=${page + 1}`}
              className="px-3 py-1 border border-border rounded hover:text-fg-primary hover:border-border-strong transition-colors"
            >
              다음
            </a>
          )}
        </div>
      )}
    </main>
  );
}
