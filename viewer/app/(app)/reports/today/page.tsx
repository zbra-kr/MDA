// viewer/app/(app)/reports/today/page.tsx
// /reports/today → 최신 리포트 날짜로 리다이렉트.
// daily_reports에 데이터가 있으면 최신 날짜, 없으면 오늘 KST.
import { redirect } from "next/navigation";
import { USE_MOCK } from "@/lib/mock-data";
import { supabaseServer } from "@/lib/supabase/server";

export default async function TodayRedirect() {
  const todayKST = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  let date = todayKST;

  if (!USE_MOCK) {
    try {
      const sb = await supabaseServer();
      const { data } = await sb
        .from("daily_reports")
        .select("report_date")
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.report_date) date = data.report_date;
    } catch {
      // 접근 실패 시 오늘 날짜 사용
    }
  }

  redirect(`/reports/${date}`);
}
