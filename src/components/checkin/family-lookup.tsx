"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NumericKeypad } from "./numeric-keypad";

interface HouseholdResult {
  household: {
    id: string;
    primary_guardian_name: string;
    secondary_guardian_name?: string | null;
    matched_guardian: "primary" | "secondary";
    primary_guardian_phone_masked: string;
  };
  children: {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name?: string;
    grade?: string;
    has_alerts: boolean;
    photo_url?: string;
    room_name: string;
    pre_checked_in: boolean;
  }[];
}

interface FamilyLookupProps {
  churchId: string;
  churchName?: string;
  onHouseholdFound: (results: HouseholdResult[], method: "qr" | "phone") => void;
  onFirstTimeVisitor: () => void;
  onActivity: () => void;
}

type LookupMode = "idle" | "phone" | "scanning";

/**
 * Screen 1: Family lookup via QR scan or phone last-4.
 */
export function FamilyLookup({
  churchId,
  churchName,
  onHouseholdFound,
  onFirstTimeVisitor,
  onActivity,
}: FamilyLookupProps) {
  const [mode, setMode] = useState<LookupMode>("idle");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [disambiguation, setDisambiguation] = useState<HouseholdResult[] | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      cancelAnimationFrame(scannerRef.current);
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  const doLookup = async (params: Record<string, string>) => {
    setLoading(true);
    setError("");
    onActivity();

    try {
      const res = await fetch("/api/checkin/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ church_id: churchId, ...params }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Lookup failed");
        return;
      }

      const data = await res.json();
      const { households } = data as { households: HouseholdResult[] };

      if (households.length === 0) {
        setError("No family found. Tap 'First-Time Visitor' to register.");
        return;
      }

      const method: "qr" | "phone" = params.qr_token ? "qr" : "phone";
      if (households.length === 1) {
        onHouseholdFound(households, method);
      } else {
        setDisambiguation(households);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSubmit = () => {
    if (phoneDigits.length === 4) {
      doLookup({ phone_last4: phoneDigits });
    }
  };

  const startScanner = async () => {
    setMode("scanning");
    onActivity();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Dynamic import of jsQR to avoid SSR issues
      const { default: jsQR } = await import("jsqr");
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext("2d")!;

      const scan = () => {
        if (!video.videoWidth) {
          scannerRef.current = requestAnimationFrame(scan);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code?.data) {
          stopScanner();

          // Extract token from QR URL (e.g., /checkin?token=abc123)
          let token = code.data;
          try {
            const url = new URL(code.data, window.location.origin);
            token = url.searchParams.get("token") || code.data;
          } catch {
            // Not a URL — use raw value as token
          }

          setMode("idle");
          doLookup({ qr_token: token });
          return;
        }

        scannerRef.current = requestAnimationFrame(scan);
      };

      scannerRef.current = requestAnimationFrame(scan);
    } catch {
      setError("Camera access denied. Please use phone number instead.");
      setMode("idle");
    }
  };

  // Disambiguation — multiple families matched phone
  if (disambiguation) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <h2 className="text-2xl font-bold text-vc-indigo font-display mb-6">
          Which family?
        </h2>
        <div className="space-y-3 w-full max-w-md">
          {disambiguation.map((result) => (
            <button
              key={result.household.id}
              type="button"
              onClick={() => {
                onActivity();
                onHouseholdFound([result], "phone");
                setDisambiguation(null);
              }}
              className="w-full p-4 rounded-xl border-2 border-gray-200 bg-white
                text-left active:border-vc-coral active:bg-vc-coral/5 transition-colors"
            >
              <div className="font-semibold text-vc-indigo">
                {result.household.primary_guardian_name}
              </div>
              <div className="text-sm text-gray-500">
                {result.household.primary_guardian_phone_masked} &middot;{" "}
                {result.children.length} child
                {result.children.length !== 1 ? "ren" : ""}
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setDisambiguation(null);
            setMode("idle");
            onActivity();
          }}
          className="mt-6 text-gray-500 underline"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
      {/* Header */}
      <div className="text-center mb-4">
        {churchName && (
          <p className="text-lg text-vc-text-secondary font-medium mb-1">{churchName}</p>
        )}
        <h1 className="text-3xl font-bold text-vc-indigo font-display mb-2">
          Children&apos;s Check-In
        </h1>
        <p className="text-gray-500 text-lg">
          Scan your QR code or enter the last 4 digits of your phone number
        </p>
      </div>

      {mode === "scanning" ? (
        <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          {/* Scan overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-48 border-2 border-white/60 rounded-2xl" />
          </div>
          <button
            type="button"
            onClick={() => {
              stopScanner();
              setMode("idle");
              onActivity();
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full
              bg-white/90 text-vc-indigo font-semibold active:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : mode === "phone" ? (
        <div className="w-full max-w-sm">
          <NumericKeypad
            value={phoneDigits}
            maxLength={4}
            onChange={(v) => {
              setPhoneDigits(v);
              onActivity();
            }}
            onSubmit={handlePhoneSubmit}
          />
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setPhoneDigits("");
              setError("");
              onActivity();
            }}
            className="w-full mt-4 text-gray-500 underline text-sm"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button
            type="button"
            onClick={() => {
              startScanner();
              onActivity();
            }}
            className="h-16 rounded-2xl bg-vc-indigo text-white font-semibold text-lg
              flex items-center justify-center gap-3 active:bg-vc-indigo/90 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M3 17v2a2 2 0 002 2h2M17 21h2a2 2 0 002-2v-2" />
            </svg>
            Scan QR Code
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("phone");
              onActivity();
            }}
            className="h-16 rounded-2xl border-2 border-gray-200 bg-white text-vc-indigo
              font-semibold text-lg flex items-center justify-center gap-3
              active:border-vc-coral active:bg-vc-coral/5 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Phone Number
          </button>

          <div className="relative flex items-center my-2">
            <div className="flex-grow border-t border-gray-200" />
            <span className="mx-4 text-sm text-gray-400">or</span>
            <div className="flex-grow border-t border-gray-200" />
          </div>

          <button
            type="button"
            onClick={() => {
              onFirstTimeVisitor();
              onActivity();
            }}
            className="h-14 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500
              font-medium text-base active:border-vc-coral active:text-vc-coral transition-colors"
          >
            First-Time Visitor? Register Here
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin" />
            <span className="text-gray-600 font-medium">Looking up family...</span>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 max-w-md w-full px-4">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-3 text-center font-medium">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
