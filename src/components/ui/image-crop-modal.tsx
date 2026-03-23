"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Button } from "./button";

interface ImageCropModalProps {
  /** The file to crop */
  file: File;
  /** Called with the cropped blob */
  onCrop: (blob: Blob) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

const OUTPUT_SIZE = 300; // output pixel size
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Modal for cropping an image to a circular profile photo.
 * Uses react-easy-crop for drag, scroll-zoom, and pinch-to-zoom.
 */
export function ImageCropModal({ file, onCrop, onCancel }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleSave() {
    if (!croppedAreaPixels) return;
    setSaving(true);

    try {
      const blob = await getCroppedBlob(imageUrl, croppedAreaPixels);
      if (blob) onCrop(blob);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        >
          <h3 className="mb-4 font-display text-lg font-semibold text-vc-indigo">
            Crop profile photo
          </h3>

          {/* Crop area */}
          <div
            className="relative mx-auto overflow-hidden rounded-xl bg-vc-bg"
            style={{ width: OUTPUT_SIZE, height: OUTPUT_SIZE }}
          >
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              objectFit="contain"
              style={{
                containerStyle: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, borderRadius: 12 },
                mediaStyle: {},
                cropAreaStyle: { border: "2px solid rgba(255,255,255,0.8)" },
              }}
            />
          </div>

          {/* Zoom slider */}
          <div className="mx-auto mt-4 flex max-w-[280px] items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-vc-text-muted">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-vc-sand accent-vc-coral"
            />
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-vc-text-muted">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="11" y1="8" x2="11" y2="14" />
            </svg>
          </div>

          {/* Help text */}
          <p className="mt-2 text-center text-xs text-vc-text-muted">
            Drag to position {"\u00b7"} Scroll or pinch to zoom
          </p>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={handleSave} disabled={!croppedAreaPixels}>
              Save
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Extract the cropped region as a circular JPEG blob. */
async function getCroppedBlob(src: string, crop: Area): Promise<Blob | null> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await new Promise<void>((resolve) => {
    if (image.complete) resolve();
    else image.onload = () => resolve();
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Clip to circle
  ctx.beginPath();
  ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();

  // Draw the cropped region scaled to output size
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
  });
}
