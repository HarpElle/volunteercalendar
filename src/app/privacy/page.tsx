import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — VolunteerCal",
  description:
    "How VolunteerCal collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-vc-bg px-6 py-16 sm:py-24">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-vc-text-secondary transition-colors hover:text-vc-indigo"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Home
        </Link>

        <h1 className="font-display text-3xl text-vc-indigo sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-vc-text-muted">
          Last updated: March 2026
        </p>

        <div className="mt-10 space-y-10 text-vc-text-secondary leading-relaxed">
          {/* Introduction */}
          <section>
            <p>
              HarpElle LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
              operates VolunteerCal (the &quot;Service&quot;), a volunteer
              scheduling platform for churches, nonprofits, and
              volunteer-driven organizations. This Privacy Policy explains how
              we collect, use, share, and protect your personal information when
              you use our Service.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Information We Collect
            </h2>
            <p className="mt-3">
              We collect information you provide directly when creating an
              account or using the Service:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong>Account information</strong> — your name, email address,
                and optional phone number.
              </li>
              <li>
                <strong>Scheduling preferences</strong> — availability,
                blackout dates, ministry assignments, and role preferences.
              </li>
              <li>
                <strong>Organization data</strong> — church or organization
                name, service times, and team configurations.
              </li>
              <li>
                <strong>Billing information</strong> — payment details processed
                securely through Stripe. We do not store full credit card
                numbers on our servers.
              </li>
              <li>
                <strong>Usage data</strong> — basic information about how you
                interact with the Service, such as pages visited and actions
                taken, to help us improve the product.
              </li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              How We Use Your Information
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Generate and manage volunteer schedules for your organization.
              </li>
              <li>
                Send notifications about schedule assignments, changes, and
                reminders via email and SMS.
              </li>
              <li>Process subscription payments and manage your account.</li>
              <li>Provide customer support and respond to your requests.</li>
              <li>
                Improve, maintain, and protect the Service.
              </li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Third-Party Services
            </h2>
            <p className="mt-3">
              We use trusted third-party services to operate the platform:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong>Firebase / Google Cloud</strong> — authentication, data
                storage, and hosting infrastructure.
              </li>
              <li>
                <strong>Resend</strong> — transactional email delivery for
                schedule notifications and account communications.
              </li>
              <li>
                <strong>Twilio</strong> — SMS delivery for schedule reminders
                and confirmations.
              </li>
              <li>
                <strong>Stripe</strong> — secure payment processing for
                subscription billing.
              </li>
            </ul>
            <p className="mt-3">
              Each of these providers maintains their own privacy policies and
              data handling practices. We only share the minimum information
              necessary for each service to function.
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">Cookies</h2>
            <p className="mt-3">
              VolunteerCal uses only essential cookies required for
              authentication. Specifically, we use a Firebase authentication
              session cookie to keep you logged in. We do not use advertising
              cookies, tracking pixels, or third-party analytics cookies.
            </p>
          </section>

          {/* Data Retention and Deletion */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Data Retention and Deletion
            </h2>
            <p className="mt-3">
              We retain your personal information for as long as your account is
              active or as needed to provide the Service. If you wish to delete
              your account and associated data, you may do so from your account
              settings or by contacting us at{" "}
              <a
                href="mailto:info@volunteercal.com"
                className="text-vc-coral transition-colors hover:text-vc-coral-dark"
              >
                info@volunteercal.com
              </a>
              . We will process deletion requests within 30 days.
            </p>
            <p className="mt-3">
              Organization administrators can also export their data before
              deleting their account. Some information may be retained as
              required by law or for legitimate business purposes such as fraud
              prevention.
            </p>
          </section>

          {/* Your Rights (CCPA/GDPR) */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Your Rights
            </h2>
            <p className="mt-3">
              Depending on your location, you may have the following rights
              regarding your personal information:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong>Right to access</strong> — request a copy of the
                personal data we hold about you.
              </li>
              <li>
                <strong>Right to delete</strong> — request that we delete your
                personal data.
              </li>
              <li>
                <strong>Right to correct</strong> — request correction of
                inaccurate personal data.
              </li>
              <li>
                <strong>Right to opt out</strong> — opt out of certain data
                processing activities. We do not sell your personal information.
              </li>
              <li>
                <strong>Right to portability</strong> — request your data in a
                portable, machine-readable format.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us at{" "}
              <a
                href="mailto:info@volunteercal.com"
                className="text-vc-coral transition-colors hover:text-vc-coral-dark"
              >
                info@volunteercal.com
              </a>
              . We will respond to verified requests within 30 days.
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Children&apos;s Privacy
            </h2>
            <p className="mt-3">
              The Service is not directed at children under 13. We do not
              knowingly collect personal information from children under 13. If
              you believe a child has provided us with personal information,
              please contact us so we can take appropriate action.
            </p>
          </section>

          {/* Changes to This Policy */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Changes to This Policy
            </h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. We will
              notify you of material changes by posting the updated policy on
              this page and updating the &quot;Last updated&quot; date. Your
              continued use of the Service after changes are posted constitutes
              acceptance of the updated policy.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">Contact Us</h2>
            <p className="mt-3">
              If you have questions about this Privacy Policy or our data
              practices, please contact us:
            </p>
            <div className="mt-3 rounded-lg border border-vc-border-light bg-vc-bg-warm p-5">
              <p className="font-medium text-vc-indigo">HarpElle LLC</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:info@volunteercal.com"
                  className="text-vc-coral transition-colors hover:text-vc-coral-dark"
                >
                  info@volunteercal.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}
