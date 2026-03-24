"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CheckInSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/org/check-ins");
  }, [router]);
  return null;
}
