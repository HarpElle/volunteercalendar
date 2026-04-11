import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — VolunteerCal",
  description:
    "Sign in to your VolunteerCal account to manage volunteer schedules.",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
