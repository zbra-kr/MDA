// viewer/app/(app)/reports/today/page.tsx
// /reports/today → 최신 리포트 날짜로 리다이렉트.
// mock 모드에서는 고정 날짜, 실연결 시 daily_reports 최신 row 조회.
import { redirect } from "next/navigation";
import { USE_MOCK, mockReportMeta } from "@/lib/mock-data";
// import { supabaseServer } from "@/lib/supabase/server";

export default async function TodayRedirect() {
  let date = mockReportMeta.report_date;

  if (!USE_MOCK) {
    // const sb = await supabaseServer();
    // const { data } = await sb
    //   .from("daily_reports")
    //   .select("report_date")
    //   .order("report_date", { ascending: false })
    //   .limit(1)
    //   .single();
    // date = data?.report_date ?? date;
  }

  redirect(`/reports/${date}`);
}
