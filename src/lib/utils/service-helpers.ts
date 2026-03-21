import type { Service, ServiceMinistry, ServiceRole, MinistryAssignment } from "@/lib/types";

/**
 * Returns the ministries array for a service, normalizing legacy
 * single-ministry services into the multi-ministry format.
 *
 * When `forDate` is provided and `ministry_assignments` is populated,
 * filters to assignments effective on that date. This enables
 * timeline-based service profile changes (e.g., "add Communion Team
 * starting March 29") without modifying existing schedules.
 *
 * Priority:
 * 1. ministry_assignments (filtered by forDate) — if populated
 * 2. ministries[] — multi-ministry format
 * 3. ministry_id + roles — legacy single-ministry fallback
 */
export function getServiceMinistries(service: Service, forDate?: string): ServiceMinistry[] {
  // New: timeline-based ministry assignments take precedence
  if (service.ministry_assignments && service.ministry_assignments.length > 0) {
    let filtered: MinistryAssignment[];

    if (forDate) {
      filtered = service.ministry_assignments.filter((ma) => {
        if (ma.effective_from > forDate) return false;
        if (ma.effective_until && ma.effective_until < forDate) return false;
        return true;
      });
    } else {
      // No date: return currently-effective assignments (effective_until is null)
      filtered = service.ministry_assignments.filter((ma) => ma.effective_until === null);
    }

    if (filtered.length > 0) {
      return filtered.map((ma) => ({
        ministry_id: ma.ministry_id,
        roles: ma.roles,
        start_time: ma.start_time,
        end_time: ma.end_time,
      }));
    }
    // Fall through if no assignments match the date
  }

  // Existing: multi-ministry format
  if (service.ministries && service.ministries.length > 0) {
    return service.ministries;
  }

  // Legacy: build from ministry_id + flat roles
  return [
    {
      ministry_id: service.ministry_id,
      roles: service.roles,
      start_time: null,
      end_time: null,
    },
  ];
}

/**
 * Returns the default (always-on) ministries for a service on a given date.
 * Excludes optional/ad-hoc teams (is_default === false).
 */
export function getDefaultServiceMinistries(service: Service, forDate?: string): ServiceMinistry[] {
  if (service.ministry_assignments && service.ministry_assignments.length > 0) {
    let filtered: MinistryAssignment[];

    if (forDate) {
      filtered = service.ministry_assignments.filter((ma) => {
        if (!ma.is_default) return false;
        if (ma.effective_from > forDate) return false;
        if (ma.effective_until && ma.effective_until < forDate) return false;
        return true;
      });
    } else {
      filtered = service.ministry_assignments.filter(
        (ma) => ma.is_default && ma.effective_until === null,
      );
    }

    if (filtered.length > 0) {
      return filtered.map((ma) => ({
        ministry_id: ma.ministry_id,
        roles: ma.roles,
        start_time: ma.start_time,
        end_time: ma.end_time,
      }));
    }
  }

  // Fallback: all existing ministries are considered default
  return getServiceMinistries(service, forDate);
}

/**
 * Returns optional/ad-hoc ministries available on a given date.
 * These can be toggled on per service occurrence.
 */
export function getOptionalServiceMinistries(service: Service, forDate?: string): ServiceMinistry[] {
  if (!service.ministry_assignments || service.ministry_assignments.length === 0) {
    return [];
  }

  let filtered: MinistryAssignment[];

  if (forDate) {
    filtered = service.ministry_assignments.filter((ma) => {
      if (ma.is_default) return false;
      if (ma.effective_from > forDate) return false;
      if (ma.effective_until && ma.effective_until < forDate) return false;
      return true;
    });
  } else {
    filtered = service.ministry_assignments.filter(
      (ma) => !ma.is_default && ma.effective_until === null,
    );
  }

  return filtered.map((ma) => ({
    ministry_id: ma.ministry_id,
    roles: ma.roles,
    start_time: ma.start_time,
    end_time: ma.end_time,
  }));
}

/**
 * Returns all ministry IDs for a service, optionally filtered by date.
 */
export function getServiceMinistryIds(service: Service, forDate?: string): string[] {
  return getServiceMinistries(service, forDate).map((m) => m.ministry_id);
}

/**
 * Returns a flat list of all roles across all ministries for a service.
 */
export function getAllServiceRoles(
  service: Service,
  forDate?: string,
): (ServiceRole & { ministry_id: string })[] {
  return getServiceMinistries(service, forDate).flatMap((m) =>
    m.roles.map((r) => ({ ...r, ministry_id: m.ministry_id })),
  );
}

/**
 * Builds the legacy flat fields (ministry_id + roles) from a ministries array.
 * Used when saving a service to maintain backward compatibility.
 */
export function flattenMinistries(ministries: ServiceMinistry[]): {
  ministry_id: string;
  roles: ServiceRole[];
} {
  return {
    ministry_id: ministries[0]?.ministry_id || "",
    roles: ministries.flatMap((m) => m.roles),
  };
}
