import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { PainPoints } from "@/components/landing/pain-points";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
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
