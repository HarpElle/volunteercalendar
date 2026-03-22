"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";

/**
 * Layout for /calendar routes — authenticated calendar views.
 * Shares dashboard auth guard but no sidebar.
 */
export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-vc-bg font-sans">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
    </div>
  );
}
