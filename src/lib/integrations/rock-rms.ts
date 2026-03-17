/**
 * Rock RMS connector.
 *
 * Uses Rock's REST API with API Key authentication.
 * Rock is self-hosted, so the base URL varies per installation.
 * Uses OData v3 query conventions ($filter, $select, $top, $skip).
 *
 * API docs: https://www.rockrms.com/Rock/BookContent/9
 */

import type { ChmsAdapter, ImportedPerson, ImportedTeam } from "./types";

async function rockFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}/api${path}`;
  return fetch(url, {
    headers: {
      "Authorization-Token": apiKey,
      Accept: "application/json",
    },
  });
}

/** Paginate through all results using OData $top/$skip */
async function rockFetchAll(
  baseUrl: string,
  apiKey: string,
  path: string,
  pageSize = 100,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let skip = 0;
  const separator = path.includes("?") ? "&" : "?";

  while (true) {
    const res = await rockFetch(
      baseUrl,
      apiKey,
      `${path}${separator}$top=${pageSize}&$skip=${skip}`,
    );
    if (!res.ok) break;

    const data: Record<string, unknown>[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    results.push(...data);
    if (data.length < pageSize) break; // Last page
    skip += pageSize;
  }

  return results;
}

export const rockRmsAdapter: ChmsAdapter = {
  provider: "rock_rms",

  async testConnection(credentials) {
    try {
      const res = await rockFetch(
        credentials.base_url,
        credentials.api_key,
        "/People?$top=1",
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchPeople(credentials) {
    const { base_url, api_key } = credentials;
    const raw = await rockFetchAll(
      base_url,
      api_key,
      "/People?$select=Id,NickName,LastName,Email,PhoneNumbers&$filter=IsDeceased eq false and RecordStatusValueId eq 3",
    );

    const people: ImportedPerson[] = [];

    for (const person of raw) {
      const id = String(person.Id || "");
      const firstName = (person.NickName as string) || (person.FirstName as string) || "";
      const lastName = (person.LastName as string) || "";
      const name = [firstName, lastName].filter(Boolean).join(" ");
      const email = (person.Email as string) || "";

      if (!email || !name) continue;

      // Phone may come as a nested array or separate field depending on $expand
      let phone: string | null = null;
      const phones = person.PhoneNumbers as Record<string, unknown>[] | undefined;
      if (phones && Array.isArray(phones) && phones.length > 0) {
        phone = (phones[0].NumberFormatted as string) || (phones[0].Number as string) || null;
      }

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
    const { base_url, api_key } = credentials;

    // Fetch "Serving Team" group type groups
    // Rock's default Serving Team GroupTypeId is typically 23, but this varies.
    // We fetch all groups of purpose "Serving Area" or type "Serving Team"
    // Safest approach: fetch GroupTypes first, find serving-related ones, then groups
    const groupTypes = await rockFetchAll(
      base_url,
      api_key,
      "/GroupTypes?$select=Id,Name&$filter=GroupTypePurposeValueId ne null",
    );

    // Find group types that look like serving teams
    const servingTypeIds = groupTypes
      .filter((gt) => {
        const name = ((gt.Name as string) || "").toLowerCase();
        return name.includes("serving") || name.includes("volunteer") || name.includes("team");
      })
      .map((gt) => gt.Id);

    // If no serving types found, fall back to fetching all groups
    const filterParts = servingTypeIds.length > 0
      ? servingTypeIds.map((id) => `GroupTypeId eq ${id}`).join(" or ")
      : "IsActive eq true";

    const groups = await rockFetchAll(
      base_url,
      api_key,
      `/Groups?$select=Id,Name,GroupTypeId&$filter=(${filterParts}) and IsActive eq true`,
    );

    const teams: ImportedTeam[] = [];

    for (const group of groups) {
      const groupId = String(group.Id || "");
      const groupName = (group.Name as string) || `Group ${groupId}`;

      // Fetch members of this group
      const members = await rockFetchAll(
        base_url,
        api_key,
        `/GroupMembers?$select=PersonId&$filter=GroupId eq ${groupId} and GroupMemberStatus eq 1`,
      );
      const memberIds = members.map((m) => String(m.PersonId || ""));

      teams.push({
        external_id: groupId,
        name: groupName,
        member_ids: memberIds,
      });
    }

    return teams;
  },
};
