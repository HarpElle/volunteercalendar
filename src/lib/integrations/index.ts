export { INTEGRATIONS, getIntegrationConfig } from "./config";
export { planningCenterAdapter } from "./planning-center";
export { breezeAdapter } from "./breeze";
export { rockRmsAdapter } from "./rock-rms";
export type {
  IntegrationProvider,
  IntegrationConfig,
  IntegrationCredentials,
  ImportedPerson,
  ImportedTeam,
  ImportResult,
  ChmsAdapter,
} from "./types";

import type { ChmsAdapter, IntegrationProvider } from "./types";
import { planningCenterAdapter } from "./planning-center";
import { breezeAdapter } from "./breeze";
import { rockRmsAdapter } from "./rock-rms";

const adapters: Record<IntegrationProvider, ChmsAdapter> = {
  planning_center: planningCenterAdapter,
  breeze: breezeAdapter,
  rock_rms: rockRmsAdapter,
};

export function getAdapter(provider: IntegrationProvider): ChmsAdapter {
  return adapters[provider];
}
