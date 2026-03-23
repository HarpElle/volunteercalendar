"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RoomSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/settings?tab=rooms");
  }, [router]);
  return null;
}
