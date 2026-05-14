// viewer/components/radar/matched-sku-card.tsx
// anomaly 상세 사이드바 — 매칭된 자사 SKU 카드.
import type { ProductMatch } from "@/lib/supabase/types";
import { fmtKRW } from "@/lib/format";
import { cn } from "@/lib/utils";

const STOCK_LABEL: Record<string, string> = {
  out: "품절",
  critical: "위험",
  low: "부족",
  normal: "정상",
  overstock: "과잉",
};

const STOCK_COLOR: Record<string, string> = {
  out: "text-sev-high-fg",
  critical: "text-sev-high-fg",
  low: "text-sev-med-fg",
  normal: "text-trend-up",
  overstock: "text-fg-tertiary",
};

interface Props {
  match: ProductMatch;
}

export function MatchedSkuCard({ match }: Props) {
  const d = (match.diff_summary ?? {}) as Record<string, unknown>;
  const name = (d.own_product_name as string) ?? "자사 상품";
  const priceDiffKrw = d.price_diff_krw as number | undefined;
  const priceDiffPct = d.price_diff_pct as number | undefined;
  const posPrice = d.own_price_pos as number | undefined;
  const msrp = d.own_price_msrp as number | undefined;
  const stockQty = d.stock_qty as number | undefined;
  const stockStatus = (d.stock_status as string) ?? "normal";
  const sales7d = d.sales_avg_7d as number | undefined;

  return (
    <div className="bg-raised border border-border-subtle rounded-md p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg-primary truncate">
            {name}
          </div>
          <div className="text-2xs font-mono text-fg-tertiary mt-0.5">
            {match.own_sku}
          </div>
        </div>
        <span className="shrink-0 text-2xs font-mono text-fg-secondary num bg-sunken px-1.5 py-px rounded-sm">
          {(match.similarity_score * 100).toFixed(0)}%
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Kv label="POS 가격" value={fmtKRW(posPrice)} />
        <Kv label="정상가" value={fmtKRW(msrp)} />
        <Kv
          label="가격차"
          value={
            priceDiffKrw != null
              ? `${priceDiffKrw > 0 ? "+" : ""}${priceDiffKrw.toLocaleString()}원`
              : "—"
          }
          valueClassName={cn(
            priceDiffKrw != null && priceDiffKrw < 0 && "text-trend-up",
            priceDiffKrw != null && priceDiffKrw > 0 && "text-trend-down",
          )}
          sub={priceDiffPct != null ? `${priceDiffPct > 0 ? "+" : ""}${priceDiffPct}%` : undefined}
        />
        <Kv
          label="재고"
          value={stockQty != null ? `${stockQty.toLocaleString()}개` : "—"}
          valueClassName={STOCK_COLOR[stockStatus]}
          sub={STOCK_LABEL[stockStatus]}
        />
        <Kv
          label="7일 평균 판매"
          value={sales7d != null ? `${sales7d}개/일` : "—"}
        />
      </dl>

      <div className="mt-3 pt-3 border-t border-border-hair flex gap-2">
        <button className="flex-1 h-7 rounded-sm border border-border text-xs font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
          매장 노출 요청
        </button>
        <button className="flex-1 h-7 rounded-sm border border-border text-xs font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
          상세 보기
        </button>
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  valueClassName,
  sub,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string;
}) {
  return (
    <div>
      <dt className="text-fg-quaternary">{label}</dt>
      <dd className={cn("num text-fg-primary mt-0.5", valueClassName)}>
        {value}
        {sub && <span className="text-fg-quaternary ml-1">{sub}</span>}
      </dd>
    </div>
  );
}
