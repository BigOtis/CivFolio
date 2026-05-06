# Project Empire

```text
Claude/Codex starter prompt: Use https://github.com/BigOtis/CivFolio as the base for my own map-based portfolio or personal world. Start by asking me for my resume, bio, social links, headshot, featured projects/works, screenshots, timeline, preferred tone, and deployment target. Then replace the seeded content in content/leader.json, content/site.json, content/works/*.json, content/timeline/snapshots.json, and public/assets/*, adapt the map/city theme to my work, and prepare it to deploy from GitHub.
```

Project Empire is an MIT-licensed, self-hosted, file-backed portfolio starter that turns your resume, projects, creative work, or media archive into a living 4X-inspired strategy map.

It is built for developers, artists, musicians, writers, video creators, editors, consultants, and hybrid builders who want a portfolio that feels authored instead of interchangeable. There is no database and no hosted backend. Everything lives in versioned files inside the repo.

Repo: https://github.com/BigOtis/CivFolio

## Current feature set

- Full-screen map-first homepage with hex terrain, rivers, routes, fog, minimap, filters, zoom, pan, and timeline scrubbing
- Campaign-style intro replay that founds cities over time
- Route-driven in-map dossier plus canonical `/work/[slug]` pages
- City growth tiers: settlement, town, city, capital, wonder
- Project-specific city styling with shared world cohesion
- Great Works monuments, improvement tiles, and moving traveler units
- Ambient music plus UI and intro sound effects
- Leader profile modal, archive/civilopedia view, and about page
- Mobile-responsive map HUD and dossier behavior
- Typed content model for code, art, music, video, writing, and client work
- Optional build-time GitHub enrichment with local cache fallback
- Static export-friendly Next.js setup with validation, linting, tests, and Playwright coverage

## Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Zod
- Vitest
- Playwright

## Local development

```bash
npm install
npm run validate:content
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run build
npm run build:with-sync
npm run sync:github
npm run validate:content
npm run lint
npm run test
npm run test:e2e
```

## Content model

All user-editable data lives in the repo:

- `content/site.json`: site title, theme, nav, audio, scene config, social links
- `content/leader.json`: leader/about profile
- `content/works/*.json`: portfolio entries
- `content/timeline/snapshots.json`: timeline progression and city overrides
- `content/generated/github-cache.json`: normalized GitHub enrichment cache
- `public/assets/*`: images, portraits, screenshots, and demo visuals

Every work shares one core schema and can add an optional facet:

- `code`
- `art`
- `music`
- `video`
- `writing`
- `client`

## Customize it for yourself

Start with:

1. Replace `content/leader.json` with your own profile, headline, contact links, and avatar.
2. Replace `content/site.json` branding, navigation, theme, audio, intro order, and social links.
3. Edit or replace files in `content/works/` with your own projects, clients, art, videos, music, writing, or whatever your world is made of.
4. Update each work's map coordinates, relationships, media, Great Works, and links.
5. Adjust `content/timeline/snapshots.json` so the world grows in the order you want.
6. Replace seeded screenshots and art in `public/assets/`.
7. Run `npm run validate:content`.
8. Build with `npm run build` or `npm run build:with-sync`.

Good source material to hand an assistant:

- your resume
- short bio
- social links
- headshot/avatar
- featured projects or clients
- screenshots and demo URLs
- GitHub repos
- timeline or career milestones
- tone references

## GitHub sync

GitHub support is optional and build-time only.

If a work includes:

```json
"code": {
  "repo": {
    "owner": "your-name",
    "name": "your-repo"
  }
}
```

then you can enrich local cache data with:

```bash
npm run sync:github
```

Use `GITHUB_TOKEN` or `GH_TOKEN` if you want richer GitHub metrics such as closed issue counts and commit history totals.

If no token is present, the site still works. If sync fails, the starter falls back to local content and cached data.

## Deploy from GitHub

This project is optimized for static export.

```bash
npm run build
```

The generated site is emitted to `out/`.

Simple GitHub-centered deployment flow:

1. Fork or clone `https://github.com/BigOtis/CivFolio`.
2. Customize the content and assets.
3. Push your version to your own GitHub repo.
4. Deploy the static output from GitHub using one of:
   - GitHub Pages
   - Vercel connected to your GitHub repo
   - Netlify connected to your GitHub repo
   - Cloudflare Pages connected to your GitHub repo

If you want a pure GitHub Pages flow, build the project and publish the `out/` directory through a Pages workflow or static branch.

## Notes

- The visual language is strategy-game inspired, not a direct Civ UI clone.
- No database, auth system, or hosted admin panel is required.
- The seeded demo is Phil Lopez's world, but the structure is meant to be replaced.
