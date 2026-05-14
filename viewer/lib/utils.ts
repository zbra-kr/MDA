// viewer/lib/utils.ts
// shadcn 표준 className 머지 헬퍼.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
