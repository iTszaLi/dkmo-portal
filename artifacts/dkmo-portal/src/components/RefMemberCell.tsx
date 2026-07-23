import { useMemo } from "react";
import { Link } from "wouter";
import { useListMembers } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MemberRef {
  id: string;
  fullName: string;
  membershipId: string;
  applicationNumber?: string | null;
}

/**
 * Index of all members keyed by internal id, used to resolve a referrer's
 * human-readable identifiers (name + DKMO ID) from the stored reference.
 * Backed by the members list query, so it shares the react-query cache with
 * the pages that already load members.
 */
export function useMemberIndex(): Map<string, MemberRef> {
  const { data } = useListMembers({});
  return useMemo(() => {
    const map = new Map<string, MemberRef>();
    for (const m of data ?? []) {
      map.set(m.id, {
        id: m.id,
        fullName: m.fullName,
        membershipId: m.membershipId,
        applicationNumber: (m as { applicationNumber?: string | null }).applicationNumber ?? null,
      });
    }
    return map;
  }, [data]);
}

export const REF_MEMBER_TOOLTIP = "Member who referred this applicant.";

/**
 * Human-readable "Reference Member" cell: referrer name (linked to their
 * profile) with their DKMO ID beneath. Internal UUIDs are never shown — if
 * the reference cannot be resolved, only the stored name is displayed.
 */
export function RefMemberCell({
  refId,
  refName,
  index,
  emptyLabel = "—",
  className,
}: {
  refId?: string | null;
  refName?: string | null;
  index: Map<string, MemberRef>;
  emptyLabel?: string;
  className?: string;
}) {
  const resolved = refId ? index.get(refId) : undefined;
  const name = resolved?.fullName || refName;

  if (!name) {
    return <span className={cn("text-xs text-emerald-500/70 dark:text-slate-600", className)}>{emptyLabel}</span>;
  }

  const inner = (
    <div className={cn("text-sm leading-tight", className)} title={REF_MEMBER_TOOLTIP}>
      <div className={cn("text-emerald-900 dark:text-slate-200 font-medium truncate max-w-[160px] sm:max-w-none", resolved && "group-hover:underline")}>{name}</div>
      {resolved && (
        <div className="text-xs text-emerald-600 dark:text-slate-500">{resolved.membershipId}</div>
      )}
    </div>
  );

  return resolved ? (
    <Link href={`/members/${resolved.id}`} className="block group" data-testid={`link-ref-member-${resolved.membershipId}`}>
      {inner}
    </Link>
  ) : inner;
}

/** Format a stored reference id for display: DKMO ID if resolvable, raw text if it's not a UUID, otherwise hidden. */
export function formatRefId(refId: string | null | undefined, index: Map<string, MemberRef>): string | null {
  if (!refId) return null;
  const resolved = index.get(refId);
  if (resolved) return resolved.membershipId;
  return UUID_RE.test(refId) ? null : refId;
}
