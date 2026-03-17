/**
 * Breeze ChMS connector.
 *
 * Uses Breeze's REST API with API Key authentication.
 * Fetches people and tags (used as groups/teams in Breeze).
 *
 * API docs: https://app.breezechms.com/api (requires Breeze login)
 */

import type { ChmsAdapter, ImportedPerson, ImportedTeam } from "./types";

function breezeBase(subdomain: string): string {
  return `https://${subdomain}.breezechms.com/api`;
}

async function breezeFetch(
  subdomain: string,
  apiKey: string,
  path: string,
): Promise<Response> {
  return fetch(`${breezeBase(subdomain)}${path}`, {
    headers: {
      "Api-Key": apiKey,
      Accept: "application/json",
    },
  });
}

export const breezeAdapter: ChmsAdapter = {
  provider: "breeze",

  async testConnection(credentials) {
    try {
      const res = await breezeFetch(
        credentials.subdomain,
        credentials.api_key,
        "/people",
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchPeople(credentials) {
    const { subdomain, api_key } = credentials;
    const res = await breezeFetch(subdomain, api_key, "/people");
    if (!res.ok) return [];

    const raw: Record<string, unknown>[] = await res.json();
    const people: ImportedPerson[] = [];

    for (const person of raw) {
      const id = String(person.id || "");
      const firstName = (person.first_name as string) || "";
      const lastName = (person.last_name as string) || "";
      const name = [firstName, lastName].filter(Boolean).join(" ");

      // Breeze stores contact info in a details field or at the top level
      let email = "";
      let phone: string | null = null;

      // Try top-level fields first
      if (person.email) {
        email = String(person.email);
      }
      if (person.phone) {
        phone = String(person.phone);
      }

      // Also check details array if present
      const details = person.details as Record<string, unknown>[] | undefined;
      if (details && Array.isArray(details)) {
        for (const d of details) {
          if (d.field_type === "email" && !email) {
            email = String(d.value || "");
          }
          if (d.field_type === "phone" && !phone) {
            phone = String(d.value || "");
          }
        }
      }

      if (!email || !name) continue;

      people.push({
        external_id: id,
        name,
        email,
        phone,
        groups: [],
      });
    }

    return people;
  },

  async fetchTeams(credentials) {
    const { subdomain, api_key } = credentials;

    // Breeze uses tags as groups. Fetch tag folders first, then tags, then people per tag.
    const tagsRes = await breezeFetch(subdomain, api_key, "/tags/list_tags");
    if (!tagsRes.ok) return [];

    const rawTags: Record<string, unknown>[] = await tagsRes.json();
    const teams: ImportedTeam[] = [];

    for (const tag of rawTags) {
      const tagId = String(tag.id || "");
      const tagName = (tag.name as string) || `Tag ${tagId}`;
      const folderName = (tag.folder_name as string) || "";

      // Fetch people in this tag
      const peopleRes = await breezeFetch(
        subdomain,
        api_key,
        `/tags/list_people?tag_id=${tagId}`,
      );
      if (!peopleRes.ok) continue;

      const tagPeople: Record<string, unknown>[] = await peopleRes.json();
      const memberIds = tagPeople.map((p) => String(p.id || ""));

      teams.push({
        external_id: tagId,
        name: folderName ? `${folderName} — ${tagName}` : tagName,
        member_ids: memberIds,
      });
    }

    return teams;
  },
};
