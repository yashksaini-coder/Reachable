import { SNAPSHOT } from "@/lib/landing-data";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { SixAnswers } from "@/components/landing/SixAnswers";
import { InstallWindow } from "@/components/landing/InstallWindow";
import { Evidence } from "@/components/landing/Evidence";
import { Verdicts } from "@/components/landing/Verdicts";
import { StatBand } from "@/components/landing/StatBand";
import { HowItRuns } from "@/components/landing/HowItRuns";
import { Cta } from "@/components/landing/Cta";
import { Footer } from "@/components/landing/Footer";

export const metadata = { title: "Reachable — supply-chain incident console" };

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <SixAnswers />
        <InstallWindow />
        <Evidence />
        <Verdicts />
        <StatBand />
        <HowItRuns />
        <Cta />
      </main>
      <Footer snapshot={SNAPSHOT} />
    </>
  );
}
