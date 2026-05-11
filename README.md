# Project Empire

Project Empire is a map-based portfolio framework. It turns a resume, project list, creative archive, or body of work into a living strategy-map world: projects become cities, milestones become Great Works, tools become units, and the timeline shows how the empire grew.

The live seeded version is Phil Lopez's world:

https://projectempire.robot-future.com/

The repo is meant to be cloned and replaced with your own story. There is no database, hosted CMS, or private backend. The whole site is driven by versioned JSON content and static assets in the repository.

Repo: https://github.com/BigOtis/Project-Empire

## Why This Exists

Most portfolios become stale because they are just another page to maintain. Project Empire is built to make the work itself feel worth updating.

It is especially useful if your work does not fit into one clean lane. Code, client work, games, writing, videos, tools, experiments, and half-public prototypes can all live in the same world without pretending they are the same kind of artifact.

It also works well with AI coding tools. Codex, Claude, or another agent can update the content from a resume, GitHub repo, project note, or screenshot set, then validate and rebuild the world.

## Starter Prompt

Give this to Codex or Claude if you want it to customize the repo for you:

```text
Use https://github.com/BigOtis/Project-Empire as the base for my own map-based portfolio or personal world.

Start by asking me for my resume, bio, social links, headshot, featured projects or works, screenshots, timeline, preferred tone, and deployment target.

Then replace the seeded content in content/leader.json, content/site.json, content/works/*.json, content/timeline/snapshots.json, and public/assets/*.

Adapt the map, city names, relationships, Great Works, units, theme, and copy to fit my work. Run the content validator and prepare the site to deploy from GitHub.
```

## Features

- Full-screen strategy-map homepage with terrain, routes, fog, minimap, filters, zoom, pan, and timeline scrubbing
- Campaign-style intro that founds cities over time
- City dossiers with screenshots, project context, links, metrics, relationships, Great Works, and production queues
- Canonical `/work/[slug]` pages for each project
- City growth tiers: settlement, town, city, capital, wonder
- Project-specific city styling while keeping the world visually cohesive
- Great Works monuments, improvement tiles, and moving units
- Ambient music, UI sounds, and intro sound effects
- Leader profile, archive view, about page, SEO metadata, social preview images, and mobile support
- Typed content model for code, art, music, video, writing, and client work
- Optional build-time GitHub enrichment with local cache fallback
- Static export-friendly Next.js setup with validation, linting, Vitest, and Playwright tests

## Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Zod
- Vitest
- Playwright
- PixiJS

## Local Development

```bash
npm install
npm run validate:content
npm run dev
```

Open `http://localhost:3000`.

## Common Commands

```bash
npm run dev              # Start local dev server
npm run build            # Build static export into out/
npm run build:with-sync  # Refresh GitHub cache, then build
npm run sync:github      # Update optional GitHub enrichment cache
npm run validate:content # Validate JSON content against the schema
npm run lint             # Run ESLint
npm run test             # Run Vitest
npm run test:e2e         # Run Playwright tests
```

## How The Content Works

Most customization happens in `content/` and `public/assets/`.

- `content/site.json`: site title, tagline, navigation, theme, audio, map config, intro order, social links, and units
- `content/leader.json`: leader/about profile, contact links, avatar, skills, philosophy, and achievements
- `content/works/*.json`: project, job, client, artwork, writing, video, or tool entries
- `content/timeline/snapshots.json`: timeline eras and city visibility/growth over time
- `content/generated/github-cache.json`: optional normalized GitHub metadata cache
- `public/assets/*`: portraits, screenshots, thumbnails, city art, audio, favicons, and social images

Each work has shared fields such as title, summary, description, media, links, map position, relationships, highlights, trade routes, Great Works, and metrics. A work can also include one facet for more specific detail:

- `code`
- `art`
- `music`
- `video`
- `writing`
- `client`

Run this after editing content:

```bash
npm run validate:content
```

## Customize It

1. Fork or clone `https://github.com/BigOtis/Project-Empire`.
2. Replace `content/leader.json` with your own profile, headline, links, avatar, skills, and philosophy.
3. Update `content/site.json` with your site name, theme, nav, intro order, units, audio, and social links.
4. Replace the entries in `content/works/` with your own projects, jobs, clients, games, tools, writing, videos, art, or experiments.
5. Give each work a map position, terrain, region, relationships, media, links, highlights, and Great Works.
6. Update `content/timeline/snapshots.json` so your world appears and grows in the right order.
7. Replace images, screenshots, icons, audio, and preview assets in `public/assets/`.
8. Run `npm run validate:content`, `npm run lint`, and `npm run build`.

Good source material to collect before customizing:

- Resume or LinkedIn export
- Short bio
- Headshot or avatar
- Social links
- GitHub repos
- Product links
- Screenshots and demo videos
- Featured projects, clients, games, articles, talks, or tools
- Career timeline or milestone list
- A few examples of the tone you want

## GitHub Sync

GitHub sync is optional and only runs at build time when you ask for it.

If a work includes a repo reference:

```json
"code": {
  "repo": {
    "owner": "your-name",
    "name": "your-repo"
  }
}
```

you can refresh the local GitHub cache with:

```bash
npm run sync:github
```

Set `GITHUB_TOKEN` or `GH_TOKEN` for richer data and higher API limits. Without a token, the site still works from local content. If sync fails, the build falls back to the existing cache and JSON files.

## Deploy

Project Empire is optimized for static export.

```bash
npm run build
```

The generated site is emitted to `out/`.

Common deployment targets:

- Vercel connected to your GitHub repo
- Netlify connected to your GitHub repo
- Cloudflare Pages connected to your GitHub repo
- GitHub Pages using a workflow that publishes `out/`
- Google Cloud Run using the included Dockerfile

For Cloud Run, the repo builds the static export and serves it from nginx.

## Project Shape

```text
content/
  leader.json
  site.json
  timeline/snapshots.json
  works/*.json
public/
  assets/
src/
  app/
  components/
  lib/
scripts/
  validate-content.ts
  sync-github.ts
tests/
```

## Notes

- The visual language is strategy-game inspired, not a direct clone of any specific game UI.
- The seeded content is Phil Lopez's world; replace it freely.
- The project is MIT licensed.
- No database, auth system, hosted CMS, or admin panel is required.
