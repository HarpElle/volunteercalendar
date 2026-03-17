"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-vc-bg/90 shadow-sm backdrop-blur-md border-b border-vc-border-light"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-vc-indigo text-vc-text-on-dark transition-transform group-hover:scale-105">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="9" y1="4" x2="9" y2="10" />
              <line x1="15" y1="4" x2="15" y2="10" />
              <circle cx="8" cy="15" r="1" fill="currentColor" />
              <circle cx="12" cy="15" r="1" fill="currentColor" />
              <circle cx="16" cy="15" r="1" fill="currentColor" />
            </svg>
          </div>
          <span className="font-display text-xl text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-vc-text-secondary transition-colors hover:text-vc-indigo"
            >
              {link.label}
            </a>
          ))}
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="text-sm font-medium text-vc-text-secondary transition-colors hover:text-vc-indigo"
            >
              Log In
            </a>
            <a
              href="/register"
              className="rounded-full bg-vc-coral px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-vc-coral-dark hover:shadow-md active:scale-[0.98]"
            >
              Start Free
            </a>
          </div>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-vc-indigo md:hidden"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-vc-border-light bg-vc-bg/95 backdrop-blur-md md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
              >
                Log In
              </a>
              <a
                href="/register"
                onClick={() => setMobileOpen(false)}
                className="mt-2 rounded-full bg-vc-coral px-5 py-2.5 text-center text-sm font-semibold text-white"
              >
                Start Free
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
