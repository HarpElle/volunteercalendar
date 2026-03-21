"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";

export interface CampusFormData {
  name: string;
  address: string;
  location: { lat: number; lng: number } | null;
  isPrimary: boolean;
}

interface CampusFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CampusFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving: boolean;
  initialValues?: CampusFormData;
  isEditing: boolean;
}

export function CampusFormModal({
  open,
  onClose,
  onSubmit,
  onDelete,
  saving,
  initialValues,
  isEditing,
}: CampusFormModalProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setAddress(initialValues?.address ?? "");
      setLocation(initialValues?.location ?? null);
      setIsPrimary(initialValues?.isPrimary ?? false);
    }
  }, [open, initialValues]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({ name, address, location, isPrimary });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Campus" : "Add Campus"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Campus Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Main Campus, North Campus"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-vc-indigo">
              Address
            </label>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onPlaceSelect={(place) => {
                setAddress(place.address);
                setLocation({ lat: place.lat, lng: place.lng });
              }}
              placeholder="123 Church St, City, ST"
            />
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral"
          />
          <span className="text-sm text-vc-text-secondary">Primary campus</span>
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>
            {isEditing ? "Save Changes" : "Add Campus"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto inline-flex items-center min-h-[44px] px-3 text-sm font-medium text-vc-danger hover:text-vc-danger/80 transition-colors"
            >
              Delete Campus
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
