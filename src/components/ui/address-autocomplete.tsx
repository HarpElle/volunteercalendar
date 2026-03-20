"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";

interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing an address…",
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Load Google Maps Places library
  useEffect(() => {
    if (!API_KEY || typeof window === "undefined") return;

    // Already loaded
    if (window.google?.maps?.places) {
      setLoaded(true);
      return;
    }

    let cancelled = false;
    import("@googlemaps/js-api-loader").then(({ setOptions, importLibrary }) => {
      if (cancelled) return;
      setOptions({ key: API_KEY });
      importLibrary("places").then(() => {
        if (!cancelled) setLoaded(true);
      });
    });

    return () => { cancelled = true; };
  }, []);

  // Attach autocomplete to input
  const attachAutocomplete = useCallback(() => {
    if (!loaded || !inputRef.current || autocompleteRef.current) return;

    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      fields: ["formatted_address", "geometry"],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (place.formatted_address && place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        onChange(place.formatted_address);
        setSelectedCoords({ lat, lng });
        onPlaceSelect({ address: place.formatted_address, lat, lng });
      }
    });

    autocompleteRef.current = ac;
  }, [loaded, onChange, onPlaceSelect]);

  useEffect(() => {
    attachAutocomplete();
  }, [attachAutocomplete]);

  // Static map preview
  const showMap = API_KEY && selectedCoords;

  return (
    <div>
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Clear coords when user types manually
          if (selectedCoords) setSelectedCoords(null);
        }}
        placeholder={placeholder}
      />
      {showMap && (
        <img
          src={`https://maps.googleapis.com/maps/api/staticmap?center=${selectedCoords.lat},${selectedCoords.lng}&zoom=15&size=400x150&scale=2&markers=color:red%7C${selectedCoords.lat},${selectedCoords.lng}&key=${API_KEY}`}
          alt="Map preview"
          className="mt-2 w-full max-w-sm rounded-lg border border-vc-border-light"
        />
      )}
    </div>
  );
}
