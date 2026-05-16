// viewer/lib/auth.ts
// 서버 전용 인증 헬퍼. RSC·Server Action에서만 import.
import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  full_name: string | null;
  role: "admin" | "viewer";
  team: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSession(): Promise<User | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data as Profile | null;
}

export async function requireAuth(): Promise<{
  user: User;
  profile: Profile | null;
}> {
  const user = await getSession();
  if (!user) redirect("/auth/login");
  const profile = await getProfile(user.id);
  return { user, profile };
}

export async function requireAdmin(): Promise<{
  user: User;
  profile: Profile;
}> {
  const user = await getSession();
  if (!user) redirect("/auth/login");
  const profile = await getProfile(user.id);
  if (!profile || profile.role !== "admin") redirect("/");
  return { user, profile };
}
