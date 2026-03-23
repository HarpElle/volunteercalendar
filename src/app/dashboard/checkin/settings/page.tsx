"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CheckInSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/settings?tab=checkin");
  }, [router]);
  return null;
}
