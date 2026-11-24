/** A project manager's mark beside its name (the session list, its window's head): its words come from the caller. */
export function PmBadge({ label, title }: { label: string; title: string }) {
  return <span className="cp-pm-badge" title={title}>{label}</span>;
}
