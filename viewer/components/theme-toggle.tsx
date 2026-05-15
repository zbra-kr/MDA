// viewer/components/theme-toggle.tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const BTN_CLASS = cn(
  "inline-flex items-center gap-2 h-7 px-2.5 rounded-md",
  "border border-border text-sm font-medium text-fg-secondary",
  "transition-colors",
);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button type="button" aria-label="테마 전환" aria-pressed={false} tabIndex={-1} className={BTN_CLASS}>
        <span className="w-1.5 h-1.5 rounded-full bg-fg-tertiary" />
        <span className="w-[13px] h-[13px]" />
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label="테마 전환"
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(BTN_CLASS, "hover:bg-hover hover:text-fg-primary hover:border-border-strong")}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", isDark ? "bg-house-soft" : "bg-fg-tertiary")} />
      {isDark ? <Moon size={13} /> : <Sun size={13} />}
    </button>
  );
}
