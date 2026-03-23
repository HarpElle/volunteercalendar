"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "./button";

interface ImageCropModalProps {
  /** The file to crop */
  file: File;
  /** Called with the cropped blob */
  onCrop: (blob: Blob) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

const CANVAS_SIZE = 300; // output pixel size
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

/**
 * Modal for cropping an image to a circular profile photo.
 * Supports drag-to-pan and scroll/pinch-to-zoom. Canvas-based output.
 */
export function ImageCropModal({ file, onCrop, onCancel }: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Transform state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Drag state
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Load image from file
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Fit image to fill the canvas area
      const minDim = Math.min(img.width, img.height);
      const fitScale = CANVAS_SIZE / minDim;
      setScale(fitScale);
      // Center the image
      setOffset({
        x: (CANVAS_SIZE - img.width * fitScale) / 2,
        y: (CANVAS_SIZE - img.height * fitScale) / 2,
      });
      setImgLoaded(true);
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file]);

  // Draw the preview
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw image with current transform
    ctx.save();
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);
    ctx.restore();

    // Draw circular mask overlay
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw circle border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  }, [scale, offset]);

  useEffect(() => {
    if (imgLoaded) draw();
  }, [imgLoaded, draw]);

  // Pointer events for drag
  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }

  function handlePointerUp() {
    dragStart.current = null;
  }

  // Scroll/pinch to zoom
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setScale((s) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta * s));
      // Zoom toward center
      const ratio = newScale / s;
      setOffset((o) => ({
        x: CANVAS_SIZE / 2 - (CANVAS_SIZE / 2 - o.x) * ratio,
        y: CANVAS_SIZE / 2 - (CANVAS_SIZE / 2 - o.y) * ratio,
      }));
      return newScale;
    });
  }

  // Crop and output
  async function handleSave() {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);

    const out = document.createElement("canvas");
    out.width = CANVAS_SIZE;
    out.height = CANVAS_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw image with same transform
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);

    out.toBlob(
      (blob) => {
        if (blob) onCrop(blob);
        setSaving(false);
      },
      "image/jpeg",
      0.9,
    );
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

          {/* Canvas area */}
          <div
            ref={containerRef}
            className="relative mx-auto overflow-hidden rounded-xl bg-vc-bg"
            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, touchAction: "none" }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            />
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-vc-coral border-t-transparent" />
              </div>
            )}
          </div>

          {/* Info text */}
          <p className="mt-3 text-center text-xs text-vc-text-muted">
            Drag to position {"\u00b7"} Scroll to zoom {"\u00b7"} JPEG, PNG, WebP, or GIF {"\u00b7"} Max 5 MB
          </p>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={handleSave} disabled={!imgLoaded}>
              Save
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
