"use client";
// viewer/app/(app)/admin/users/_components/role-toggle.tsx
import { useState, useTransition } from "react";
import { updateUserRole } from "../actions";

interface Props {
  userId: string;
  currentRole: "admin" | "viewer";
}

export function RoleToggle({ userId, currentRole }: Props) {
  const [role, setRole] = useState(currentRole);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const newRole = role === "admin" ? "viewer" : "admin";
    startTransition(async () => {
      const res = await updateUserRole(userId, newRole);
      if (!res.error) setRole(newRole);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="text-xs text-fg-tertiary hover:text-fg-secondary disabled:opacity-50 transition-colors border border-border rounded px-2 py-0.5"
    >
      {pending
        ? "처리 중..."
        : role === "admin"
          ? "viewer로 변경"
          : "admin으로 변경"}
    </button>
  );
}
