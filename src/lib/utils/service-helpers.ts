import type { Service, ServiceMinistry, ServiceRole } from "@/lib/types";

/**
 * Returns the ministries array for a service, normalizing legacy
 * single-ministry services into the multi-ministry format.
 */
export function getServiceMinistries(service: Service): ServiceMinistry[] {
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
 * Returns all ministry IDs for a service.
 */
export function getServiceMinistryIds(service: Service): string[] {
  return getServiceMinistries(service).map((m) => m.ministry_id);
}

/**
 * Returns a flat list of all roles across all ministries for a service.
 */
export function getAllServiceRoles(service: Service): (ServiceRole & { ministry_id: string })[] {
  return getServiceMinistries(service).flatMap((m) =>
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
