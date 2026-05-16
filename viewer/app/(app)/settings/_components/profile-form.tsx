"use client";
// viewer/app/(app)/settings/_components/profile-form.tsx
import { useActionState } from "react";
import { updateProfile } from "../actions";

interface Props {
  userId: string;
  initialFullName: string;
  initialTeam: string;
}

export function ProfileForm({ userId, initialFullName, initialTeam }: Props) {
  const [state, action, pending] = useActionState(updateProfile, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="user_id" value={userId} />

      <div>
        <label
          htmlFor="full_name"
          className="block text-sm font-medium text-fg-secondary mb-1"
        >
          이름
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          defaultValue={initialFullName}
          placeholder="홍길동"
          className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-sm text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:ring-1 focus:ring-border-strong"
        />
      </div>

      <div>
        <label
          htmlFor="team"
          className="block text-sm font-medium text-fg-secondary mb-1"
        >
          팀
        </label>
        <input
          id="team"
          name="team"
          type="text"
          defaultValue={initialTeam}
          placeholder="IT팀"
          className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-sm text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:ring-1 focus:ring-border-strong"
        />
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-600">{state.success}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-9 px-4 rounded-md bg-fg-primary text-canvas text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}
