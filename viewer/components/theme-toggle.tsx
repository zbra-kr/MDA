// viewer/components/theme-toggle.tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label="테마 전환"
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex items-center gap-2 h-7 px-2.5 rounded-md",
        "border border-border text-sm font-medium text-fg-secondary",
        "hover:bg-hover hover:text-fg-primary hover:border-border-strong",
        "transition-colors",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          mounted && isDark ? "bg-house-soft" : "bg-fg-tertiary",
        )}
      />
      {mounted ? (
        isDark ? <Moon size={13} /> : <Sun size={13} />
      ) : (
        <span className="w-[13px] h-[13px]" />
      )}
    </button>
  );
}
