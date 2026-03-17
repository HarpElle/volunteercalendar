import type { IntegrationConfig } from "./types";

export const INTEGRATIONS: IntegrationConfig[] = [
  {
    provider: "planning_center",
    label: "Planning Center",
    description: "Import people and serving teams from Planning Center Online (PCO).",
    authFields: [
      {
        key: "app_id",
        label: "Application ID",
        type: "text",
        placeholder: "Your PCO Application ID",
        required: true,
      },
      {
        key: "secret",
        label: "Secret",
        type: "password",
        placeholder: "Your PCO Secret",
        required: true,
      },
    ],
  },
  {
    provider: "breeze",
    label: "Breeze ChMS",
    description: "Import people and tags from Breeze Church Management.",
    authFields: [
      {
        key: "subdomain",
        label: "Breeze Subdomain",
        type: "text",
        placeholder: "yourchurch (from yourchurch.breezechms.com)",
        required: true,
      },
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        placeholder: "Your Breeze API key",
        required: true,
      },
    ],
  },
  {
    provider: "rock_rms",
    label: "Rock RMS",
    description: "Import people and groups from your Rock RMS instance.",
    authFields: [
      {
        key: "base_url",
        label: "Rock Instance URL",
        type: "url",
        placeholder: "https://rock.yourchurch.org",
        required: true,
      },
      {
        key: "api_key",
        label: "REST API Key",
        type: "password",
        placeholder: "Your Rock REST API key",
        required: true,
      },
    ],
  },
];

export function getIntegrationConfig(provider: string): IntegrationConfig | undefined {
  return INTEGRATIONS.find((i) => i.provider === provider);
}
