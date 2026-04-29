import Link from "next/link";

import type { SiteConfig } from "@/lib/content/schema";

const projectLinks = [
  { label: "Robot Future", href: "https://www.robot-future.com/" },
  { label: "Source", href: "https://github.com/BigOtis/CivFolio" },
];

export function SiteShell({
  site,
  children,
  chrome = "standard",
}: {
  site: SiteConfig;
  children: React.ReactNode;
  chrome?: "standard" | "minimal";
}) {
  const minimal = chrome === "minimal";

  return (
    <div className="min-h-screen text-[var(--ink)]">
      <header
        className={
          minimal
            ? // Below 760px the world map provides its own HUD (matching the
              // `isMobile` breakpoint used by WorldExplorer) with the same nav
              // surfaces (Civilopedia, About) reachable from the Controls panel.
              // Hide the SiteShell pill on those viewports so it does not
              // compete with the in-map HUD or intercept its pointer events,
              // then re-expose it on wider screens where there is room for both.
              "pointer-events-none fixed inset-x-0 top-0 z-50 hidden px-1.5 pt-1.5 min-[760px]:block sm:px-4 sm:pt-3"
            : "sticky top-0 z-40 border-b border-white/10 bg-[rgba(15,10,8,0.72)] backdrop-blur"
        }
      >
        <div
          className={
            minimal
              ? "pointer-events-auto mx-auto flex w-full max-w-7xl items-center justify-center gap-1.5 rounded-[14px] border border-[rgba(244,211,141,0.14)] bg-[rgba(12,10,9,0.58)] px-1.5 py-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:justify-between sm:gap-3 sm:rounded-[24px] sm:px-4 sm:py-3"
              : "mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8"
          }
        >
          <Link href="/" className={minimal ? "group hidden flex-col sm:flex" : "group flex flex-col"}>
            <span className="font-display text-3xl leading-none tracking-[0.18em] text-[var(--accent-strong)] uppercase">
              {site.title}
            </span>
            <span className="text-xs tracking-[0.32em] text-[var(--muted)] uppercase">
              {site.tagline}
            </span>
          </Link>
          <nav
            className={
              minimal
                ? "flex items-center justify-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--muted)] sm:flex-wrap sm:justify-end sm:gap-2 sm:text-[11px] sm:tracking-[0.22em]"
                : "flex flex-wrap items-center gap-2 text-sm uppercase tracking-[0.24em] text-[var(--muted)]"
            }
          >
            {site.navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  minimal
                    ? "rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)] sm:px-4 sm:py-2"
                    : "rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                }
              >
                {item.label}
              </Link>
            ))}
            {projectLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={
                  minimal
                    ? "hidden rounded-full border border-[var(--accent)]/30 bg-[rgba(244,211,141,0.06)] px-3 py-2 text-[var(--accent-strong)] transition hover:border-[var(--accent)] hover:text-[var(--parchment)] sm:inline-flex sm:px-4"
                    : "rounded-full border border-[var(--accent)]/30 bg-[rgba(244,211,141,0.06)] px-4 py-2 text-[var(--accent-strong)] transition hover:border-[var(--accent)] hover:text-[var(--parchment)]"
                }
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className={minimal ? "min-[760px]:pt-[4.5rem]" : undefined}>{children}</main>
      {minimal ? null : (
        <footer className="border-t border-white/10 bg-[rgba(15,10,8,0.82)]">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-[var(--muted)] sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
            <p>{site.description}</p>
            <div className="flex flex-wrap gap-3">
              {projectLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[var(--accent)]/30 bg-[rgba(244,211,141,0.06)] px-4 py-2 text-[var(--accent-strong)] transition hover:border-[var(--accent)] hover:text-[var(--parchment)]"
                >
                  {link.label}
                </a>
              ))}
              {site.socialLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/10 px-4 py-2 transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
