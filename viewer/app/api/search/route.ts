// viewer/app/api/search/route.ts
// 브랜드·상품 텍스트 검색 API — supabaseServer() (anon/authenticated read)
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ brands: [], products: [] });
  }

  try {
    const sb = await supabaseServer();
    const pattern = `%${q}%`;

    const [brandsRes, productsRes] = await Promise.all([
      sb
        .from("brands")
        .select("id, name, slug, is_competitor, is_own")
        .ilike("name", pattern)
        .order("name")
        .limit(6),
      sb
        .from("products")
        .select("id, name, musinsa_no, thumbnail_url, url, brands(name, slug)")
        .ilike("name", pattern)
        .limit(6),
    ]);

    return NextResponse.json({
      brands: brandsRes.data ?? [],
      products: productsRes.data ?? [],
    });
  } catch {
    return NextResponse.json({ brands: [], products: [] });
  }
}
