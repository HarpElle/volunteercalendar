import type { Person, Household } from "@/lib/types";

interface HouseholdCardProps {
  household: Household;
  volunteers: Person[];
  onEdit: () => void;
  onDelete: () => void;
}

export function HouseholdCard({
  household,
  volunteers,
  onEdit,
  onDelete,
}: HouseholdCardProps) {
  const memberNames = household.volunteer_ids
    .map((id) => volunteers.find((v) => v.id === id)?.name)
    .filter(Boolean);

  const constraintBadges: { label: string; color: string }[] = [];
  if (household.constraints.never_same_service) {
    constraintBadges.push({ label: "Never together", color: "bg-vc-coral/10 text-vc-coral" });
  }
  if (household.constraints.prefer_same_service) {
    constraintBadges.push({ label: "Prefer together", color: "bg-vc-sage/15 text-vc-sage" });
  }
  if (household.constraints.never_same_time) {
    constraintBadges.push({ label: "Never same day", color: "bg-amber-100 text-amber-700" });
  }

  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-4 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg text-vc-indigo">{household.name}</h3>
          <p className="mt-0.5 text-xs text-vc-text-muted">
            {household.volunteer_ids.length} {household.volunteer_ids.length === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-vc-text-secondary transition-colors hover:text-vc-coral"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-vc-text-muted transition-colors hover:text-vc-danger"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Member names */}
      {memberNames.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {memberNames.map((n, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-vc-indigo/8 px-2 py-0.5 text-xs font-medium text-vc-indigo"
            >
              {n}
            </span>
          ))}
        </div>
      )}

      {/* Constraint badges */}
      {constraintBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {constraintBadges.map((b) => (
            <span
              key={b.label}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${b.color}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {household.notes && (
        <p className="mt-2 text-xs text-vc-text-muted line-clamp-2">{household.notes}</p>
      )}
    </div>
  );
}
