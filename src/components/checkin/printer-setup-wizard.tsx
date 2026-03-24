"use client";

import { useCallback, useState } from "react";
import {
  discoverPrinters,
  printLabels,
  type KioskPrinterConfig,
} from "@/lib/services/kiosk-print-bridge";

interface PrinterSetupWizardProps {
  churchId: string;
  stationName?: string;
  onComplete: (config: KioskPrinterConfig) => void;
  onSkip: () => void;
}

type Step = "brand" | "connection" | "discover" | "test" | "done";

interface DiscoveredPrinter {
  name: string;
  address: string;
  type: string;
}

/**
 * Printer Setup Wizard — shown from the kiosk when no printer is configured.
 * Guides through: brand → connection type → discover → test → done.
 * Saves config both to Firestore (server-side for label generation)
 * and localStorage (client-side for connection routing).
 */
export function PrinterSetupWizard({
  churchId,
  stationName,
  onComplete,
  onSkip,
}: PrinterSetupWizardProps) {
  const [step, setStep] = useState<Step>("brand");
  const [brand, setBrand] = useState<"brother" | "zebra" | "airprint" | null>(null);
  const [connectionType, setConnectionType] = useState<"bluetooth" | "wifi">("wifi");
  const [searching, setSearching] = useState(false);
  const [printers, setPrinters] = useState<DiscoveredPrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<DiscoveredPrinter | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "printing" | "success" | "failed">("idle");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  /** Save printer config to Firestore via API + localStorage, then complete. */
  const saveAndComplete = useCallback(async (config: KioskPrinterConfig) => {
    setSaving(true);
    setSaveError("");

    const printerType =
      config.print_method === "airprint"
        ? "brother_ql" // AirPrint can work with any label format; default to Brother PNG
        : brand === "brother"
          ? "brother_ql"
          : "zebra_zd";

    try {
      const res = await fetch("/api/checkin/printer-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          printer: {
            station_name: stationName || "Kiosk 1",
            printer_type: printerType,
            ip_address: config.ip_address,
            print_method: config.print_method || "native_sdk",
            connection_type: config.connection_type || "wifi",
            bluetooth_address: config.bluetooth_address,
            printer_model: config.printer_model,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Failed to save printer config");
        setSaving(false);
        return;
      }

      // Save local connection config to localStorage
      localStorage.setItem(
        "vc_kiosk_printer",
        JSON.stringify({ ...config, printer_type: printerType }),
      );

      setSaving(false);
      onComplete(config);
    } catch {
      setSaveError("Could not save. Check your internet and try again.");
      setSaving(false);
    }
  }, [brand, churchId, onComplete]);

  const handleBrandSelect = useCallback((b: "brother" | "zebra" | "airprint") => {
    setBrand(b);
    if (b === "airprint") {
      saveAndComplete({ print_method: "airprint" });
      return;
    }
    setStep("connection");
  }, [saveAndComplete]);

  const handleDiscover = useCallback(async () => {
    setStep("discover");
    setSearching(true);
    setPrinters([]);
    const found = await discoverPrinters();
    setPrinters(found);
    setSearching(false);
  }, []);

  const handleSelectPrinter = useCallback((printer: DiscoveredPrinter) => {
    setSelectedPrinter(printer);
    setStep("test");
  }, []);

  const handleTestPrint = useCallback(async () => {
    if (!selectedPrinter) return;
    setTestStatus("printing");

    // Create a minimal test payload — the server generates real labels,
    // but for the test we send a tiny 1x1 white PNG
    const testPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

    const config: KioskPrinterConfig = {
      print_method: "native_sdk",
      printer_type: brand === "brother" ? "brother_ql" : "zebra_zd",
      connection_type: connectionType,
      ip_address: connectionType === "wifi" ? selectedPrinter.address : undefined,
      bluetooth_address: connectionType === "bluetooth" ? selectedPrinter.address : undefined,
      printer_model: selectedPrinter.name,
    };

    const result = await printLabels(
      [{ format: "png", data: testPng, printer_id: "test" }],
      config,
    );

    if (result.success) {
      setTestStatus("success");
      // Save config and complete after brief delay
      setTimeout(() => {
        saveAndComplete(config);
      }, 1500);
    } else {
      setTestStatus("failed");
    }
  }, [selectedPrinter, brand, connectionType, saveAndComplete]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 max-w-md mx-auto">
      {/* Header */}
      <div className="w-16 h-16 rounded-2xl bg-vc-coral/10 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-vc-indigo font-display mb-2 text-center">
        {step === "brand" && "Set Up Printer"}
        {step === "connection" && "Connection Type"}
        {step === "discover" && "Finding Printers"}
        {step === "test" && "Test Print"}
        {step === "done" && "All Set!"}
      </h2>

      {/* Save error */}
      {saveError && (
        <p className="text-red-500 text-sm text-center mb-4">{saveError}</p>
      )}

      {/* Saving overlay */}
      {saving && (
        <div className="flex items-center gap-3 text-gray-500 mb-4">
          <span className="w-5 h-5 border-2 border-gray-300 border-t-vc-coral rounded-full animate-spin" />
          Saving printer settings...
        </div>
      )}

      {/* Step: Brand selection */}
      {step === "brand" && !saving && (
        <>
          <p className="text-gray-500 text-center mb-8">
            What kind of label printer will this kiosk use?
          </p>
          <div className="w-full space-y-3">
            <BrandButton
              label="Brother QL"
              description="QL-820NWB, QL-810W, and others"
              onClick={() => handleBrandSelect("brother")}
            />
            <BrandButton
              label="Zebra ZD"
              description="ZD421, ZD621, and others"
              onClick={() => handleBrandSelect("zebra")}
            />
            <BrandButton
              label="Other (AirPrint)"
              description="Any AirPrint-compatible printer"
              onClick={() => handleBrandSelect("airprint")}
            />
          </div>
          <button type="button" onClick={onSkip} className="mt-6 text-gray-400 text-sm">
            Skip for now
          </button>
        </>
      )}

      {/* Step: Connection type */}
      {step === "connection" && !saving && (
        <>
          <p className="text-gray-500 text-center mb-8">
            How is the printer connected?
          </p>
          <div className="w-full space-y-3">
            <BrandButton
              label="WiFi"
              description="Printer is on the same WiFi network"
              onClick={() => { setConnectionType("wifi"); handleDiscover(); }}
            />
            <BrandButton
              label="Bluetooth"
              description="Pair directly via Bluetooth"
              onClick={() => { setConnectionType("bluetooth"); handleDiscover(); }}
            />
          </div>
          <button type="button" onClick={() => setStep("brand")} className="mt-6 text-gray-400 text-sm">
            Back
          </button>
        </>
      )}

      {/* Step: Discover */}
      {step === "discover" && !saving && (
        <>
          <p className="text-gray-500 text-center mb-6">
            {searching
              ? `Searching for ${brand} printers via ${connectionType}...`
              : printers.length > 0
                ? "Select your printer:"
                : "No printers found. Make sure the printer is on and connected."}
          </p>

          {searching && (
            <div className="w-8 h-8 border-3 border-gray-200 border-t-vc-coral rounded-full animate-spin mb-6" />
          )}

          {!searching && printers.length > 0 && (
            <div className="w-full space-y-2 mb-6">
              {printers.map((p) => (
                <button
                  key={p.address}
                  type="button"
                  onClick={() => handleSelectPrinter(p)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-vc-border-light
                    hover:border-vc-coral hover:bg-vc-coral/5 transition-colors text-left min-h-[44px]"
                >
                  <div>
                    <p className="font-medium text-vc-indigo">{p.name}</p>
                    <p className="text-sm text-gray-400">{p.address}</p>
                  </div>
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {!searching && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDiscover}
                className="px-5 py-2.5 rounded-full bg-vc-coral text-white font-medium text-sm min-h-[44px]"
              >
                Search Again
              </button>
              <button type="button" onClick={() => setStep("connection")} className="px-5 py-2.5 rounded-full border border-vc-border-light text-gray-500 text-sm min-h-[44px]">
                Back
              </button>
            </div>
          )}
        </>
      )}

      {/* Step: Test print */}
      {step === "test" && selectedPrinter && !saving && (
        <>
          <p className="text-gray-500 text-center mb-2">
            Connected to <span className="font-medium text-vc-indigo">{selectedPrinter.name}</span>
          </p>
          <p className="text-gray-400 text-sm text-center mb-8">
            {selectedPrinter.address} via {connectionType}
          </p>

          {testStatus === "idle" && (
            <button
              type="button"
              onClick={handleTestPrint}
              className="px-8 py-3 rounded-full bg-vc-coral text-white font-semibold text-base min-h-[44px]"
            >
              Send Test Print
            </button>
          )}
          {testStatus === "printing" && (
            <div className="flex items-center gap-3 text-gray-500">
              <span className="w-5 h-5 border-2 border-gray-300 border-t-vc-coral rounded-full animate-spin" />
              Sending test label...
            </div>
          )}
          {testStatus === "success" && (
            <p className="text-vc-sage font-medium flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Test print sent! Saving settings...
            </p>
          )}
          {testStatus === "failed" && (
            <div className="text-center">
              <p className="text-red-600 font-medium mb-4">Test print failed</p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => { setTestStatus("idle"); }}
                  className="px-5 py-2.5 rounded-full bg-vc-coral text-white font-medium text-sm min-h-[44px]"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={() => setStep("discover")}
                  className="px-5 py-2.5 rounded-full border border-vc-border-light text-gray-500 text-sm min-h-[44px]"
                >
                  Choose Different Printer
                </button>
              </div>
            </div>
          )}

          {testStatus === "idle" && (
            <button type="button" onClick={() => setStep("discover")} className="mt-6 text-gray-400 text-sm">
              Back
            </button>
          )}
        </>
      )}
    </div>
  );
}

function BrandButton({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-vc-border-light
        hover:border-vc-coral hover:bg-vc-coral/5 transition-colors text-left min-h-[44px]"
    >
      <div>
        <p className="font-semibold text-vc-indigo">{label}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}
