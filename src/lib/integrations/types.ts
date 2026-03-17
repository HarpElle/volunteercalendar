/**
 * Integration framework types.
 *
 * Each ChMS connector implements the ChmsAdapter interface,
 * normalizing external data into VolunteerCal's import format.
 */

export type IntegrationProvider = "planning_center" | "breeze" | "rock_rms";

export interface IntegrationConfig {
  provider: IntegrationProvider;
  /** Display name for the UI */
  label: string;
  /** Short description */
  description: string;
  /** Fields the user must provide to authenticate */
  authFields: AuthField[];
}

export interface AuthField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder: string;
  required: boolean;
}

/** Credentials stored per-church for a connected integration */
export interface IntegrationCredentials {
  provider: IntegrationProvider;
  /** Encrypted/stored credential values keyed by AuthField.key */
  values: Record<string, string>;
  connected_at: string;
}

/** A person record normalized from any ChMS */
export interface ImportedPerson {
  external_id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Tags, groups, or teams this person belongs to (used for ministry mapping) */
  groups: string[];
}

/** A team/group record normalized from any ChMS */
export interface ImportedTeam {
  external_id: string;
  name: string;
  /** Member external IDs */
  member_ids: string[];
}

/** Result of a sync/import operation */
export interface ImportResult {
  provider: IntegrationProvider;
  people: ImportedPerson[];
  teams: ImportedTeam[];
  /** People skipped (e.g., no email) */
  skipped: number;
  /** Errors encountered */
  errors: string[];
  imported_at: string;
}

/** The adapter interface each ChMS connector must implement */
export interface ChmsAdapter {
  provider: IntegrationProvider;

  /** Validate credentials by making a test API call. Returns true if valid. */
  testConnection(credentials: Record<string, string>): Promise<boolean>;

  /** Fetch all people from the ChMS */
  fetchPeople(credentials: Record<string, string>): Promise<ImportedPerson[]>;

  /** Fetch all teams/groups from the ChMS */
  fetchTeams(credentials: Record<string, string>): Promise<ImportedTeam[]>;
}
