import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { PainPoints } from "@/components/landing/pain-points";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Footer } from "@/components/landing/footer";

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "VolunteerCal",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description:
    "Flexible volunteer scheduling for churches, nonprofits, and volunteer-driven organizations. Auto-generate conflict-free schedules. Leaders review. Volunteers confirm.",
  url: "https://volunteercal.com",
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Starter", price: "29", priceCurrency: "USD" },
    { "@type": "Offer", name: "Growth", price: "69", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro", price: "119", priceCurrency: "USD" },
  ],
  creator: { "@type": "Organization", name: "HarpElle", url: "https://harpelle.com" },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is VolunteerCal only for churches?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Churches are our primary focus, but VolunteerCal works for any organization that coordinates volunteers across multiple teams: nonprofits, community groups, service organizations, and more. The scheduling logic is the same whether you're coordinating a worship team or a food pantry crew.",
      },
    },
    {
      "@type": "Question",
      name: "What if we already use Planning Center, Breeze, or Rock RMS?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "VolunteerCal is designed to complement your existing tools. You can import your volunteer roster via CSV, and we're building direct integrations with Planning Center, Breeze, and Rock RMS. Many organizations use a ChMS for membership and VolunteerCal specifically for scheduling.",
      },
    },
    {
      "@type": "Question",
      name: "Is there really a free plan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The Free plan is yours to keep. It includes up to 20 volunteers, 2 teams with 3 roles per service, and core scheduling features like auto-draft, calendar feeds, and email reminders. No credit card required, no trial period.",
      },
    },
    {
      "@type": "Question",
      name: "How does auto-draft scheduling work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You define your teams, roles, and service times. VolunteerCal generates a fair rotation across 4–8 weeks, respecting each volunteer's availability, preferred frequency, and household connections. The draft goes to team leaders for review before anyone is notified.",
      },
    },
    {
      "@type": "Question",
      name: "Can volunteers see only their own schedule?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "By default, volunteers see a clean personal view with their upcoming assignments, confirm or decline options, shift swap requests, and a personal calendar feed. They can also view the full schedule for any team they belong to, so they know who else is serving alongside them.",
      },
    },
    {
      "@type": "Question",
      name: "Does it work on phones?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. VolunteerCal is built mobile-first and can be installed as an app on any device: iPhone, Android, tablet, or desktop. Volunteers get a native app experience without downloading anything from an app store.",
      },
    },
    {
      "@type": "Question",
      name: "What happens when a volunteer can't make it?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Volunteers can decline an assignment or request a shift swap directly from their schedule. The system finds eligible replacements based on availability and qualifications. A replacement accepts, the scheduler approves, and the swap is done. No group texts required.",
      },
    },
    {
      "@type": "Question",
      name: "How is my data protected?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "VolunteerCal runs on Google Cloud (Firebase) with enterprise-grade security. Data is encrypted in transit and at rest. Each organization's data is fully isolated. We never sell or share your information.",
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Navbar />
      <Hero />
      <PainPoints />
      <HowItWorks />
      <Features />
      <Pricing />
      <FAQ />
      <WaitlistForm />
      <Footer />
    </>
  );
}
