import { listIncidents, readIncident } from "@/lib/incident";
import { LANDING_INCIDENT, buildLanding } from "@/lib/landing-data";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { SixAnswers } from "@/components/landing/SixAnswers";
import { InstallWindow } from "@/components/landing/InstallWindow";
import { Evidence } from "@/components/landing/Evidence";
import { Verdicts } from "@/components/landing/Verdicts";
import { StatBand } from "@/components/landing/StatBand";
import { HowItRuns } from "@/components/landing/HowItRuns";
import { Agents } from "@/components/landing/Agents";
import { Cta } from "@/components/landing/Cta";
import { Footer } from "@/components/landing/Footer";

export const metadata = { title: "Reachable — supply-chain incident console" };

export default async function LandingPage() {
  // The landing narrates one committed report; if it is missing, the most exposed one stands in.
  const inc = (await readIncident(LANDING_INCIDENT)) ?? (await listIncidents())[0];
  if (!inc) throw new Error(`landing needs a committed report in worker/out/ (expected ${LANDING_INCIDENT}.json)`);
  const m = buildLanding(inc);
  return (
    <>
      <Header />
      <main>
        <Hero m={m} />
        <SixAnswers questions={m.questions} />
        <InstallWindow timeline={m.timeline} meta={m.windowMeta} notes={m.windowNotes} />
        <Evidence evidence={m.evidence} />
        <Verdicts dist={m.dist} />
        <StatBand band={m.band} />
        <HowItRuns />
        <Agents />
        <Cta />
      </main>
      <Footer snapshot={m.snapshot} />
    </>
  );
}
