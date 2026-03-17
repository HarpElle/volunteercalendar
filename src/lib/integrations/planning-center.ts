/**
 * Planning Center Online (PCO) connector.
 *
 * Uses PCO's REST API with HTTP Basic Auth (Application ID + Secret).
 * Fetches from the People and Services products.
 *
 * API docs: https://developer.planning.center/docs/
 */

import type { ChmsAdapter, ImportedPerson, ImportedTeam } from "./types";

const PCO_BASE = "https://api.planningcenteronline.com";

interface PcoRequestOptions {
  app_id: string;
  secret: string;
}

async function pcoFetch(
  path: string,
  creds: PcoRequestOptions,
): Promise<Response> {
  const auth = Buffer.from(`${creds.app_id}:${creds.secret}`).toString("base64");
  const res = await fetch(`${PCO_BASE}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  if (res.status === 429) {
    // Respect rate limit: wait and retry once
    const retryAfter = Number(res.headers.get("Retry-After") || "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetch(`${PCO_BASE}${path}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });
  }
  return res;
}

/** Paginate through all results for a PCO JSON:API endpoint */
async function pcoFetchAll(
  path: string,
  creds: PcoRequestOptions,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let url = `${path}?per_page=100&offset=0`;

  while (url) {
    const res = await pcoFetch(url, creds);
    if (!res.ok) break;
    const json = await res.json();
    const data = json.data;
    if (Array.isArray(data)) {
      results.push(...data);
    }
    // PCO pagination: next link in meta or links
    url = json.links?.next || json.meta?.next?.offset
      ? `${path}?per_page=100&offset=${json.meta.next.offset}`
      : "";
    // Break if no more pages
    if (!json.meta?.next) break;
  }
  return results;
}

export const planningCenterAdapter: ChmsAdapter = {
  provider: "planning_center",

  async testConnection(credentials) {
    try {
      const creds = { app_id: credentials.app_id, secret: credentials.secret };
      const res = await pcoFetch("/people/v2/me", creds);
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchPeople(credentials) {
    const creds = { app_id: credentials.app_id, secret: credentials.secret };
    const raw = await pcoFetchAll("/people/v2/people", creds);

    const people: ImportedPerson[] = [];

    for (const person of raw) {
      const attrs = person.attributes as Record<string, unknown> | undefined;
      if (!attrs) continue;

      const email = (attrs.primary_contact_email as string) || "";
      const name = [attrs.first_name, attrs.last_name].filter(Boolean).join(" ");

      // Skip people without email (can't invite or notify them)
      if (!email) continue;

      people.push({
        external_id: String(person.id),
        name,
        email,
        phone: (attrs.primary_contact_phone as string) || null,
        groups: [], // Groups populated separately from Services teams
      });
    }

    return people;
  },

  async fetchTeams(credentials) {
    const creds = { app_id: credentials.app_id, secret: credentials.secret };

    // Fetch service types first, then teams under each
    const serviceTypes = await pcoFetchAll("/services/v2/service_types", creds);
    const teams: ImportedTeam[] = [];

    for (const st of serviceTypes) {
      const stTeams = await pcoFetchAll(
        `/services/v2/service_types/${st.id}/teams`,
        creds,
      );

      for (const team of stTeams) {
        const attrs = team.attributes as Record<string, unknown> | undefined;
        const teamName = (attrs?.name as string) || `Team ${team.id}`;

        // Fetch team members
        const members = await pcoFetchAll(
          `/services/v2/teams/${team.id}/people`,
          creds,
        );
        const memberIds = members.map((m) => String(m.id));

        teams.push({
          external_id: String(team.id),
          name: `${(st.attributes as Record<string, unknown>)?.name || "Service"} — ${teamName}`,
          member_ids: memberIds,
        });
      }
    }

    return teams;
  },
};
