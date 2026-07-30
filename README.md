# Pluribus Inc. — Company Website

Public marketing website for [Pluribus Inc.](https://pluribusdata.com), built with
[Astro](https://astro.build) as a fully static site. No backend required.

> **Content policy:** this site contains only public marketing content. Do not add
> anything from private/internal repositories.

## Commands

| Command           | Action                                        |
| :---------------- | :-------------------------------------------- |
| `npm install`     | Install dependencies                          |
| `npm run dev`     | Start dev server at `http://localhost:4321`   |
| `npm run build`   | Build the production site to `./dist/`        |
| `npm run preview` | Preview the built site locally                |

## Project structure

```text
src/
  layouts/Base.astro         Shared <head>, header/nav, footer
  components/                SectionHeading, TechCard, TeamCard
  pages/                     index, technology, about, contact, 404,
                             identity-based-navigation, team/
  pages/team/[slug].astro    Bio pages generated from src/content/team/
  content/team/*.md          One markdown file per team member (name, title,
                             headshot, order in frontmatter; bio in the body)
  assets/images/             Source images (optimized by Astro at build time)
  styles/global.css          Design tokens + base styles
public/                      Favicon and the Pluribus logo (served as-is)
```

To add or edit a team member, add/edit a markdown file in `src/content/team/` and
drop the headshot in `src/assets/images/team/`.

## Deploying

`npm run build` produces a plain static site in `dist/` — every page is a
`directory/index.html`, so it works on any static host.

### AWS S3 + CloudFront

```sh
npm run build
aws s3 sync dist/ s3://YOUR_BUCKET_NAME --delete
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

Recommended CloudFront settings:

- Origin: the S3 bucket (use Origin Access Control; keep the bucket private)
- Default root object: `index.html`
- To serve `/about/` style URLs from S3 correctly, either enable S3 static
  website hosting as the origin, or add a CloudFront Function that rewrites
  `*/` requests to `*/index.html`
- Custom error response: map 403/404 to `/404.html`

### GitHub Pages

This repo deploys automatically: every push to `main` runs
[.github/workflows/deploy.yml](.github/workflows/deploy.yml), which builds the
site and publishes it to GitHub Pages at https://pluribusdatateam.github.io.
Requirements (one-time repo setup):

1. Repo must be public (or the org on a paid plan) for Pages to publish
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**

The site is served from the domain root, so no `base` path is needed. If it
ever moves to a subpath (`…github.io/repo-name/`), set `base: '/repo-name'` in
[astro.config.mjs](astro.config.mjs).

## Contact form

There is no form backend yet — the contact page uses a `mailto:` link. To add a
hosted form later, see the comment in
[src/pages/contact.astro](src/pages/contact.astro).

## v1 snapshot

Captured 2026-07-29 from the `v1` tag (`origin/main` at the time): a
point-in-time snapshot that works, but is not the final vision. Full-page
desktop captures at 1440px; mobile at 390px.

### Home

![Home — desktop](docs/screenshots/v1/home-desktop.png)

<img src="docs/screenshots/v1/home-mobile.png" alt="Home — mobile" width="390">

### Our Technology

![Our Technology — desktop](docs/screenshots/v1/technology-desktop.png)

### About

![About — desktop](docs/screenshots/v1/about-desktop.png)

### Team

![Team — desktop](docs/screenshots/v1/team-desktop.png)

Individual bio page (representative):

![Team bio — desktop](docs/screenshots/v1/team-daniel-neustadter-desktop.png)

### Identity-Based Navigation

![Identity-Based Navigation — desktop](docs/screenshots/v1/identity-based-navigation-desktop.png)

### Contact

![Contact — desktop](docs/screenshots/v1/contact-desktop.png)
