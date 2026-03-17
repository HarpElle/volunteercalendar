import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — VolunteerCal",
  description:
    "Terms and conditions for using the VolunteerCal volunteer scheduling platform.",
};

export default function TermsOfServicePage() {
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
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-vc-text-muted">
          Last updated: March 2026
        </p>

        <div className="mt-10 space-y-10 text-vc-text-secondary leading-relaxed">
          {/* Introduction */}
          <section>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of
              VolunteerCal (the &quot;Service&quot;), operated by HarpElle LLC
              (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing
              or using the Service, you agree to be bound by these Terms. If you
              do not agree, please do not use the Service.
            </p>
          </section>

          {/* Service Description */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Service Description
            </h2>
            <p className="mt-3">
              VolunteerCal is a software-as-a-service (SaaS) platform that
              helps churches, nonprofits, and volunteer-driven organizations
              create, manage, and communicate volunteer schedules. The Service
              includes schedule generation, volunteer management, notifications,
              and related tools.
            </p>
          </section>

          {/* Account Responsibilities */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Account Responsibilities
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                You must provide accurate and complete information when creating
                an account.
              </li>
              <li>
                You are responsible for maintaining the security of your account
                credentials.
              </li>
              <li>
                You must notify us immediately if you suspect unauthorized
                access to your account.
              </li>
              <li>
                Organization administrators are responsible for managing their
                team members&apos; access and ensuring appropriate use of the
                Service.
              </li>
              <li>You must be at least 13 years old to use the Service.</li>
            </ul>
          </section>

          {/* Acceptable Use */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Acceptable Use
            </h2>
            <p className="mt-3">
              You agree not to use the Service to:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Send unsolicited messages, spam, or marketing communications
                through our email or SMS notification features.
              </li>
              <li>
                Abuse the SMS notification system, including sending messages
                unrelated to volunteer scheduling.
              </li>
              <li>
                Upload or transmit harmful, offensive, or illegal content.
              </li>
              <li>
                Attempt to gain unauthorized access to the Service, other user
                accounts, or our infrastructure.
              </li>
              <li>
                Interfere with or disrupt the Service or its underlying
                systems.
              </li>
              <li>
                Use the Service for any purpose that violates applicable laws or
                regulations.
              </li>
            </ul>
          </section>

          {/* Billing Terms */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Billing and Subscriptions
            </h2>
            <p className="mt-3">
              VolunteerCal offers subscription-based pricing tiers. Payment is
              processed securely through Stripe.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Subscriptions are billed on a recurring basis (monthly or
                annually) depending on your chosen plan.
              </li>
              <li>
                You may upgrade, downgrade, or cancel your subscription at any
                time from your account settings.
              </li>
              <li>
                Cancellations take effect at the end of the current billing
                period. You will retain access to paid features until then.
              </li>
              <li>
                Refunds are handled on a case-by-case basis. Please contact us
                if you believe you are entitled to a refund.
              </li>
              <li>
                We reserve the right to change pricing with 30 days&apos;
                notice. Existing subscribers will be notified before any price
                changes take effect on their account.
              </li>
            </ul>
          </section>

          {/* SMS Consent */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              SMS Communications
            </h2>
            <p className="mt-3">
              By providing your phone number and opting in to SMS notifications,
              you consent to receive text messages from VolunteerCal related to
              volunteer scheduling, including schedule assignments, reminders,
              and confirmations.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Message frequency varies based on your scheduling activity.
              </li>
              <li>
                Message and data rates may apply depending on your carrier.
              </li>
              <li>
                You can opt out at any time by replying <strong>STOP</strong> to
                any message or updating your notification preferences in the
                Service.
              </li>
              <li>
                Reply <strong>HELP</strong> for assistance.
              </li>
              <li>
                SMS is provided via Twilio. See{" "}
                <a
                  href="https://www.twilio.com/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-vc-coral transition-colors hover:text-vc-coral-dark"
                >
                  Twilio&apos;s Privacy Policy
                </a>{" "}
                for more details.
              </li>
            </ul>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Intellectual Property
            </h2>
            <p className="mt-3">
              The Service, including its design, code, features, and branding,
              is owned by HarpElle LLC and protected by intellectual property
              laws. You may not copy, modify, distribute, or reverse-engineer
              any part of the Service without our written permission.
            </p>
            <p className="mt-3">
              You retain ownership of any content you upload to the Service
              (such as volunteer names, schedules, and organization data). By
              using the Service, you grant us a limited license to use this
              content solely to operate and improve the Service on your behalf.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Limitation of Liability
            </h2>
            <p className="mt-3">
              To the fullest extent permitted by law, HarpElle LLC shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages arising from your use of the Service. This
              includes, but is not limited to, damages for lost data, missed
              schedules, or service interruptions.
            </p>
            <p className="mt-3">
              Our total liability for any claim arising from the Service shall
              not exceed the amount you paid us in the 12 months preceding the
              claim.
            </p>
            <p className="mt-3">
              The Service is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, either express or
              implied, including but not limited to implied warranties of
              merchantability, fitness for a particular purpose, and
              non-infringement.
            </p>
          </section>

          {/* Termination */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Termination
            </h2>
            <p className="mt-3">
              You may close your account at any time through your account
              settings or by contacting us. We may suspend or terminate your
              access to the Service if you violate these Terms or engage in
              conduct that we determine, in our sole discretion, to be harmful
              to the Service or other users.
            </p>
            <p className="mt-3">
              Upon termination, your right to use the Service ceases
              immediately. We may retain certain data as required by law or for
              legitimate business purposes. Organization administrators may
              export their data prior to account closure.
            </p>
          </section>

          {/* Governing Law */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Governing Law
            </h2>
            <p className="mt-3">
              These Terms shall be governed by and construed in accordance with
              the laws of the Commonwealth of Virginia, without regard to its
              conflict of law provisions. Any disputes arising under these Terms
              shall be resolved in the state or federal courts located in
              Virginia.
            </p>
          </section>

          {/* Changes to Terms */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">
              Changes to These Terms
            </h2>
            <p className="mt-3">
              We may update these Terms from time to time. We will notify you of
              material changes by posting the updated Terms on this page and
              updating the &quot;Last updated&quot; date. Continued use of the
              Service after changes are posted constitutes acceptance of the
              revised Terms.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="font-display text-xl text-vc-indigo">Contact Us</h2>
            <p className="mt-3">
              If you have questions about these Terms, please contact us:
            </p>
            <div className="mt-3 rounded-lg border border-vc-border-light bg-vc-bg-warm p-5">
              <p className="font-medium text-vc-indigo">HarpElle LLC</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:legal@volunteercal.com"
                  className="text-vc-coral transition-colors hover:text-vc-coral-dark"
                >
                  legal@volunteercal.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}
