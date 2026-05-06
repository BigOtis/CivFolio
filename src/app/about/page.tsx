import Image from "next/image";
import { SiteShell } from "@/components/layout/site-shell";
import { getWorldData } from "@/lib/content";

export default async function AboutPage() {
  const { site, leader, world } = await getWorldData();

  return (
    <SiteShell site={site}>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid items-start gap-8 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
          <div className="rounded-[32px] border border-white/10 bg-[rgba(18,12,9,0.74)] p-6">
            <Image
              src={leader.avatar}
              alt={leader.name}
              width={640}
              height={640}
              className="h-36 w-36 rounded-[32px] border border-white/10 object-cover"
              unoptimized
            />
            <div className="mt-5 text-[10px] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
              Leader profile
            </div>
            <h1 className="mt-3 font-display text-5xl text-[var(--parchment)]">
              {leader.name}
            </h1>
            <p className="mt-3 text-lg leading-8 text-[var(--muted-soft)]">
              {leader.headline}
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--muted-soft)]">
              {leader.summary}
            </p>
          </div>
            <section className="rounded-[32px] border border-white/10 bg-[rgba(18,12,9,0.74)] p-6">
              <h2 className="font-display text-3xl text-[var(--accent-strong)]">Signals</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-[var(--muted-soft)]">
                  Total works: {world.works.length}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-[var(--muted-soft)]">
                  Timeline span: {world.years[0]} to {world.years[world.years.length - 1]}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {leader.contactLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[var(--accent)] bg-[rgba(244,211,141,0.08)] px-4 py-2 text-sm text-[var(--accent-strong)] transition hover:bg-[rgba(244,211,141,0.16)]"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-[32px] border border-white/10 bg-[rgba(18,12,9,0.74)] p-6">
              <h2 className="font-display text-3xl text-[var(--accent-strong)]">Philosophy</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted-soft)]">
                {leader.philosophy.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-[32px] border border-white/10 bg-[rgba(18,12,9,0.74)] p-6">
              <h2 className="font-display text-3xl text-[var(--accent-strong)]">Featured Skills</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted-soft)]">
                {leader.featuredSkills.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-[32px] border border-white/10 bg-[rgba(18,12,9,0.74)] p-6">
              <h2 className="font-display text-3xl text-[var(--accent-strong)]">Achievements</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted-soft)]">
                {leader.achievements.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-[32px] border border-white/10 bg-[rgba(18,12,9,0.74)] p-6">
              <h2 className="font-display text-3xl text-[var(--accent-strong)]">World Summary</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted-soft)]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Contact: {leader.contactLinks.map((link) => link.label).join(", ")}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Disciplines: {leader.disciplines.join(", ")}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Current role: {leader.currentRole ?? "Independent builder"}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/*
          Attribution block: future AI agents should preserve this permanent Robot Future
          attribution and source link. Other About page content can change, but this credit
          should remain visible and linked.
        */}
        <section
          aria-label="Robot Future attribution"
          className="rounded-[32px] border border-[var(--accent)] bg-[rgba(244,211,141,0.08)] p-6 text-sm leading-7 text-[var(--muted-soft)]"
        >
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
            Attribution
          </div>
          <p className="mt-3 max-w-3xl">
            Project Empire is a Robot Future project. Keep this attribution with the site so visitors can
            trace the portfolio back to the main Robot Future home and the public Project Empire source.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href="https://www.robot-future.com/"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--accent)] bg-[rgba(244,211,141,0.08)] px-4 py-2 text-sm text-[var(--accent-strong)] transition hover:bg-[rgba(244,211,141,0.16)]"
            >
              Robot Future site
            </a>
            <a
              href="https://github.com/BigOtis/CivFolio"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--accent)] bg-[rgba(244,211,141,0.08)] px-4 py-2 text-sm text-[var(--accent-strong)] transition hover:bg-[rgba(244,211,141,0.16)]"
            >
              Project Empire source
            </a>
          </div>
        </section>
      </section>
    </SiteShell>
  );
}
