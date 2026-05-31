"use client";

/**
 * <PhotoCapture> — Wave 9 P0-2 sub-PR D greenfield component.
 *
 * Reusable photo-capture flow for the check-in photo endpoints. Handles:
 *   - Webcam capture via navigator.mediaDevices.getUserMedia()
 *     (user-facing camera by default — these are people photos)
 *   - File-input fallback for devices/browsers without webcam support OR
 *     when the user denies camera permission
 *   - Canvas-to-Blob conversion with content-type validation
 *   - Multipart upload to a caller-supplied URL with bearer auth
 *   - Loading + error states with retry
 *
 * The parent decides which API endpoint to POST to (the
 * authorized-pickup photo route vs. the blocked-pickup photo route vs.
 * the document route in sub-PR E). This component is content-agnostic.
 *
 * Aesthetic conformance: vc-* tokens, font-display headings, 44x44
 * minimum touch targets, warm ivory surface, coral CTA, motion-reveals
 * on modal open.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";

export interface PhotoCaptureProps {
  /** Multipart POST URL; the file is appended as `file`, plus any extras. */
  uploadUrl: string;
  /** Extra form fields (e.g. church_id). All values must be strings. */
  extraFields: Record<string, string>;
  /** Firebase ID token getter — invoked at upload time so we always have a fresh JWT. */
  getIdToken: () => Promise<string>;
  /** Called with the resulting storage_path on successful upload. */
  onSuccess: (storagePath: string) => void;
  /** Label for the trigger button. Default: "Add photo". */
  triggerLabel?: string;
  /** Override the visible variant of the trigger button. Default "outline". */
  triggerVariant?: "primary" | "secondary" | "outline" | "ghost";
  /** Max upload bytes (validated client-side; server enforces too). */
  maxBytes?: number;
  /** Allowed content types (validated client-side). */
  allowedTypes?: readonly string[];
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function PhotoCapture({
  uploadUrl,
  extraFields,
  getIdToken,
  onSuccess,
  triggerLabel = "Add photo",
  triggerVariant = "outline",
  maxBytes = DEFAULT_MAX_BYTES,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
}: PhotoCaptureProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<
    "starting" | "live" | "preview" | "uploading" | "fallback"
  >("starting");
  const [error, setError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startWebcam = useCallback(async () => {
    setError(null);
    setPhase("starting");
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPhase("fallback");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("live");
    } catch {
      // Permission denied / no camera / etc. — gracefully drop to file input.
      setPhase("fallback");
    }
  }, []);

  // Whenever the modal opens, kick off the webcam.
  useEffect(() => {
    if (!open) return;
    void startWebcam();
    return () => {
      stopStream();
    };
  }, [open, startWebcam, stopStream]);

  // Revoke any object URLs we create.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Couldn't capture image — please try again.");
          return;
        }
        if (blob.size > maxBytes) {
          setError(
            `Captured image is ${Math.round(
              blob.size / 1024 / 1024,
            )} MB — limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
          );
          return;
        }
        setCapturedBlob(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stopStream();
        setPhase("preview");
      },
      "image/jpeg",
      0.9,
    );
  }, [maxBytes, stopStream]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > maxBytes) {
        setError(
          `File is ${Math.round(file.size / 1024 / 1024)} MB — limit is ${Math.round(
            maxBytes / 1024 / 1024,
          )} MB.`,
        );
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        setError(
          `Unsupported file type. Allowed: ${allowedTypes
            .map((t) => t.replace("image/", ""))
            .join(", ")}.`,
        );
        return;
      }
      setCapturedBlob(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setPhase("preview");
    },
    [allowedTypes, maxBytes],
  );

  const handleClose = useCallback(() => {
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    setError(null);
    setOpen(false);
    setPhase("starting");
  }, [previewUrl, stopStream]);

  const handleUpload = useCallback(async () => {
    if (!capturedBlob) return;
    setPhase("uploading");
    setError(null);
    try {
      const token = await getIdToken();
      const fd = new FormData();
      fd.append(
        "file",
        capturedBlob,
        capturedBlob instanceof File
          ? capturedBlob.name
          : "capture.jpg",
      );
      for (const [k, v] of Object.entries(extraFields)) {
        fd.append(k, v);
      }
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as {
        photo_path?: string;
        document_path?: string;
      };
      const path = data.photo_path ?? data.document_path;
      if (!path) {
        throw new Error("Upload succeeded but server returned no path.");
      }
      onSuccess(path);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPhase("preview");
    }
  }, [capturedBlob, extraFields, getIdToken, onSuccess, uploadUrl, handleClose]);

  const handleRetake = useCallback(() => {
    setCapturedBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError(null);
    void startWebcam();
  }, [previewUrl, startWebcam]);

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        onClick={() => setOpen(true)}
        className="min-h-[44px]"
      >
        {triggerLabel}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Capture photo"
          >
            <motion.div
              className="bg-vc-bg rounded-2xl shadow-xl max-w-md w-full p-6"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-display font-semibold text-vc-indigo">
                  Add photo
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-vc-text-secondary hover:text-vc-indigo min-w-[44px] min-h-[44px] -mr-2"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {error && (
                <div className="mb-3 text-sm text-vc-danger bg-vc-danger/5 border border-vc-danger/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {phase === "starting" && (
                <p className="text-sm text-vc-text-secondary py-8 text-center">
                  Requesting camera access…
                </p>
              )}

              {phase === "live" && (
                <div className="space-y-3">
                  <video
                    ref={videoRef}
                    className="w-full rounded-lg bg-black aspect-[4/3] object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleCapture}
                      className="flex-1 min-h-[44px]"
                    >
                      Capture
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPhase("fallback")}
                      className="min-h-[44px]"
                    >
                      Choose file
                    </Button>
                  </div>
                </div>
              )}

              {phase === "preview" && previewUrl && (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full rounded-lg bg-black aspect-[4/3] object-cover"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleUpload}
                      className="flex-1 min-h-[44px]"
                    >
                      Use this photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRetake}
                      className="min-h-[44px]"
                    >
                      Retake
                    </Button>
                  </div>
                </div>
              )}

              {phase === "uploading" && (
                <p className="text-sm text-vc-text-secondary py-8 text-center">
                  Uploading…
                </p>
              )}

              {phase === "fallback" && (
                <div className="space-y-3">
                  <p className="text-sm text-vc-text-secondary">
                    Camera unavailable. Choose a photo from your device instead.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={allowedTypes.join(",")}
                    capture="user"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-vc-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-vc-coral file:text-white hover:file:bg-vc-coral-dark"
                  />
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
