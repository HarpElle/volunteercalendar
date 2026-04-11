export function Footer() {
  return (
    <footer className="border-t border-vc-border-light bg-vc-bg px-6 py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
          {/* Logo */}
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vc-indigo text-vc-text-on-dark">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <circle cx="8" cy="15" r="1" fill="currentColor" />
                  <circle cx="12" cy="15" r="1" fill="currentColor" />
                  <circle cx="16" cy="15" r="1" fill="currentColor" />
                </svg>
              </div>
              <span className="font-display text-lg text-vc-indigo">
                Volunteer<span className="text-vc-coral">Cal</span>
              </span>
            </div>
            <p className="mt-2 max-w-xs text-sm text-vc-text-secondary">
              Flexible volunteer scheduling for churches, nonprofits, and organizations.
            </p>
          </div>

          {/* Nav links */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <a href="#how-it-works" className="text-vc-text-secondary transition-colors hover:text-vc-indigo">
              How It Works
            </a>
            <a href="#features" className="text-vc-text-secondary transition-colors hover:text-vc-indigo">
              Features
            </a>
            <a href="#pricing" className="text-vc-text-secondary transition-colors hover:text-vc-indigo">
              Pricing
            </a>
            <a href="#faq" className="text-vc-text-secondary transition-colors hover:text-vc-indigo">
              FAQ
            </a>
            <a href="/login" className="text-vc-text-secondary transition-colors hover:text-vc-indigo">
              Log In
            </a>
            <a href="/register" className="text-vc-coral font-medium transition-colors hover:text-vc-coral-dark">
              Start Free
            </a>
          </div>
        </div>

        {/* Divider with decorative element */}
        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-vc-border-light" />
          <div className="flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-vc-coral/30" />
            <div className="h-1.5 w-1.5 rounded-full bg-vc-sage/30" />
            <div className="h-1.5 w-1.5 rounded-full bg-vc-sand/30" />
          </div>
          <div className="h-px flex-1 bg-vc-border-light" />
        </div>

        <div className="flex flex-col items-center gap-2 text-xs text-vc-text-muted">
          <div className="flex gap-4">
            <a href="/privacy" className="transition-colors hover:text-vc-indigo">
              Privacy Policy
            </a>
            <a href="/terms" className="transition-colors hover:text-vc-indigo">
              Terms of Service
            </a>
          </div>
          <p>
            &copy; {new Date().getFullYear()} VolunteerCal. All rights reserved.
          </p>
          <p>
            A{" "}
            <a
              href="https://harpelle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-vc-coral transition-colors hover:text-vc-coral-dark"
            >
              HarpElle
            </a>
            {" "}product &middot; Thoughtfully built. Reliably supported.
          </p>
          <p>
            <a
              href="mailto:info@volunteercal.com"
              className="transition-colors hover:text-vc-indigo"
            >
              info@volunteercal.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
