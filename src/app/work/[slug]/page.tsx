import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteShell } from "@/components/layout/site-shell";
import { WorkDetail } from "@/components/work/work-detail";
import { getWorldData } from "@/lib/content";
import type { Work } from "@/lib/content/schema";

const fallbackOgImage = "/brand/project-empire-og.png";

export async function generateStaticParams() {
  const { works } = await getWorldData();
  return works.map((work) => ({ slug: work.slug }));
}

function getSocialImage(work: Work) {
  return work.media.find((media) => media.kind === "image" && /\.(png|jpe?g|webp)$/i.test(media.src))?.src ?? fallbackOgImage;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { works } = await getWorldData();
  const work = works.find((entry) => entry.slug === slug);

  if (!work) {
    return {
      title: "Work Not Found",
      alternates: {
        canonical: "/",
      },
    };
  }

  const path = `/work/${work.slug}`;
  const image = getSocialImage(work);
  const title = work.title;
  const description = work.summary;

  return {
    title,
    description,
    keywords: work.tags,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "article",
      url: path,
      siteName: "Project Empire",
      title: `${title} | Project Empire`,
      description,
      images: [
        {
          url: image,
          width: image === fallbackOgImage ? 1200 : undefined,
          height: image === fallbackOgImage ? 630 : undefined,
          alt: work.media.find((media) => media.src === image)?.alt ?? `${title} in Project Empire.`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Project Empire`,
      description,
      images: [image],
    },
  };
}

export default async function WorkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { site, works, github, world } = await getWorldData();
  const work = works.find((entry) => entry.slug === slug);

  if (!work) {
    notFound();
  }

  const latestYear = world.years[world.years.length - 1];
  const city = world.states[latestYear].cities.find((entry) => entry.slug === slug);
  const repo = work.code?.repo;
  const cached = repo ? github.repos[`${repo.owner}/${repo.name}`] : undefined;

  return (
    <SiteShell site={site}>
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <WorkDetail work={work} github={cached} cityLevel={city?.level} />
      </section>
    </SiteShell>
  );
}
