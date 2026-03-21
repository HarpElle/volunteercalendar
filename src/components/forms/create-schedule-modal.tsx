"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreateScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (startDate: string, endDate: string) => Promise<void>;
  generating: boolean;
  serviceCount: number;
  volunteerCount: number;
}

function defaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toISOString().split("T")[0];
}

function defaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()) + 27);
  return d.toISOString().split("T")[0];
}

export function CreateScheduleModal({
  open,
  onClose,
  onGenerate,
  generating,
  serviceCount,
  volunteerCount,
}: CreateScheduleModalProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  // Reset form state each time modal opens
  useEffect(() => {
    if (open) {
      setStartDate(defaultStartDate());
      setEndDate(defaultEndDate());
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onGenerate(startDate, endDate);
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate Draft Schedule">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Start Date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End Date" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="rounded-lg bg-vc-bg-warm px-4 py-3 text-sm text-vc-text-secondary">
          <strong>{serviceCount}</strong> service{serviceCount !== 1 ? "s" : ""} and{" "}
          <strong>{volunteerCount}</strong> volunteer{volunteerCount !== 1 ? "s" : ""} will
          be included.
        </div>
        <div className="flex gap-3">
          <Button type="submit" loading={generating}>
            {generating ? "Generating..." : "Generate Draft"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
