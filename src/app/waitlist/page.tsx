import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function WaitlistConfirmation() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-vc-bg-subtle px-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-vc-success/10">
          <svg
            className="h-8 w-8 text-vc-success"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-vc-text">
          You&apos;re on the list!
        </h1>
        <p className="mt-4 text-lg text-vc-text-secondary">
          Thanks for your interest in VolunteerCal. We&apos;ll reach out
          with early access details and next steps.
        </p>

        <div className="mt-8">
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
