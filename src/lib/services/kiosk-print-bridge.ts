/**
 * Kiosk Print Bridge — Client-side abstraction for label printing.
 *
 * Detects the runtime environment and routes print jobs to the best available path:
 *   1. Capacitor native → Brother SDK (silent) or AirPrint plugin
 *   2. Web + print_server_url → POST to LAN print server (existing path)
 *   3. No printer → reports "no_printer" status
 *
 * The web app does NOT import from @capacitor/core — it accesses native plugins
 * via window.Capacitor which the Capacitor shell injects into the WebView.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type PrintPath =
  | "native_brother"
  | "native_airprint"
  | "print_server"
  | "none";

export interface PrintResult {
  success: boolean;
  printed: number;
  failed: number;
  errors?: string[];
}

export interface KioskPrinterConfig {
  print_method?: "native_sdk" | "print_server" | "airprint";
  printer_type?: string;
  connection_type?: "bluetooth" | "wifi";
  bluetooth_address?: string;
  ip_address?: string;
  label_size?: string;
  printer_model?: string;
}

interface LabelPayloadInput {
  format: string;
  data: string;
  printer_id: string;
}

// ─── Environment Detection ──────────────────────────────────────────────────

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCapacitorPlugin(name: string): any | null {
  if (!isCapacitorNative()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor?.Plugins?.[name] ?? null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Determine which print path is available given config + environment. */
export function detectPrintPath(
  printerConfig?: KioskPrinterConfig | null,
  printServerUrl?: string | null,
): PrintPath {
  if (isCapacitorNative()) {
    if (printerConfig?.print_method === "native_sdk") {
      if (printerConfig.printer_type === "brother_ql") return "native_brother";
    }
    if (
      printerConfig?.print_method === "airprint" ||
      printerConfig?.print_method === "native_sdk"
    ) {
      return "native_airprint";
    }
    // Default for native: AirPrint fallback
    return "native_airprint";
  }

  if (printServerUrl) return "print_server";
  return "none";
}

/** Print label payloads via the best available path. */
export async function printLabels(
  payloads: LabelPayloadInput[],
  printerConfig?: KioskPrinterConfig | null,
  printServerUrl?: string | null,
): Promise<PrintResult> {
  if (payloads.length === 0) {
    return { success: true, printed: 0, failed: 0 };
  }

  const path = detectPrintPath(printerConfig, printServerUrl);

  switch (path) {
    case "native_brother":
      return printViaBrotherSdk(payloads, printerConfig!);
    case "native_airprint":
      return printViaAirPrint(payloads);
    case "print_server":
      return printViaPrintServer(payloads, printServerUrl!);
    default:
      return {
        success: false,
        printed: 0,
        failed: payloads.length,
        errors: ["No print path available"],
      };
  }
}

/** Discover printers via native SDK (only works in Capacitor). */
export async function discoverPrinters(): Promise<
  { name: string; address: string; type: string }[]
> {
  const brotherPlugin = getCapacitorPlugin("BrotherPrint");
  if (!brotherPlugin) return [];

  try {
    const result = await brotherPlugin.search({
      wifi: true,
      bluetooth: true,
      searchDuration: 15,
    });
    return (result.printers || []).map(
      (p: { modelName: string; ipAddress?: string; macAddress?: string }) => ({
        name: p.modelName,
        address: p.ipAddress || p.macAddress || "",
        type: "brother",
      }),
    );
  } catch {
    return [];
  }
}

// ─── Print Path Implementations ──────────────────────────────────────────────

async function printViaBrotherSdk(
  payloads: LabelPayloadInput[],
  config: KioskPrinterConfig,
): Promise<PrintResult> {
  const plugin = getCapacitorPlugin("BrotherPrint");
  if (!plugin) {
    return {
      success: false,
      printed: 0,
      failed: payloads.length,
      errors: ["Brother print plugin not available"],
    };
  }

  let printed = 0;
  const errors: string[] = [];

  for (const payload of payloads) {
    try {
      await plugin.printImage({
        encodedImage: payload.data,
        printerType: config.printer_model || "QL-820NWB",
        connectionType: config.connection_type || "wifi",
        ipAddress: config.ip_address,
        macAddress: config.bluetooth_address,
        labelSize: config.label_size || "DK-2251",
      });
      printed++;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Brother print failed";
      errors.push(msg);
    }
  }

  return {
    success: errors.length === 0,
    printed,
    failed: payloads.length - printed,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

async function printViaAirPrint(
  payloads: LabelPayloadInput[],
): Promise<PrintResult> {
  const plugin = getCapacitorPlugin("AirPrint");
  if (!plugin) {
    return {
      success: false,
      printed: 0,
      failed: payloads.length,
      errors: ["AirPrint plugin not available"],
    };
  }

  let printed = 0;
  const errors: string[] = [];

  for (const payload of payloads) {
    try {
      await plugin.print({
        data: payload.data,
        format: payload.format,
      });
      printed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AirPrint failed";
      errors.push(msg);
    }
  }

  return {
    success: errors.length === 0,
    printed,
    failed: payloads.length - printed,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

async function printViaPrintServer(
  payloads: LabelPayloadInput[],
  printServerUrl: string,
): Promise<PrintResult> {
  let printed = 0;
  const errors: string[] = [];

  for (const payload of payloads) {
    try {
      const res = await fetch(`${printServerUrl}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      printed++;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Print server request failed";
      errors.push(msg);
    }
  }

  return {
    success: errors.length === 0,
    printed,
    failed: payloads.length - printed,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
