# Deployment

## Prerequisites

- **Node.js 22+** — site build and dev server
- **npm** — dependency management
- **Python 3.12+** — only needed for scrapers (`scraper.py`, `scrape_reps`, `build-districts.py`), not for the site build itself

## Environment Variables

A `.env` file in the project root can hold environment variables. Currently the only variable is `MAPBOX_TOKEN`, which is unused (OpenFreeMap replaced Mapbox). No secrets are needed for the site build. GitHub Actions workflows don't require any repository secrets either — they commit directly via the bot account.

## Local Development

```bash
npm install                    # install Node dependencies
npm run dev                    # start Astro dev server at localhost:4321
npm run build                  # generate static site in dist/
npm run preview                # preview the production build locally
```

For scraper work:

```bash
pip install -r requirements.txt   # install Python dependencies
python scripts/scraper.py         # update bill status data
python -m scripts.scrape_reps     # update rep data + boundaries
python scripts/build-districts.py # regenerate district boundary files
```

## Netlify

The site auto-deploys from the `master` branch via Netlify's GitHub integration. Configuration lives in `netlify.toml`:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 22

No build plugins or serverless functions are used.

### Setup

1. Connect the GitHub repo to Netlify.
2. Netlify auto-detects Astro and picks up the `netlify.toml` config.
3. Set up a custom domain in the Netlify dashboard. Netlify handles SSL automatically.

The site URL is configured in `astro.config.mjs` (`site: 'https://deflocksc.org'`). Update it if you change domains.

## GitHub Actions

Three workflows in `.github/workflows/` keep data files current. All commit directly to `master`, which triggers a Netlify rebuild.

| Workflow | File | Schedule | Updates |
|---|---|---|---|
| Scrape Bill Status | `scrape-bills.yml` | Weekly Mon 9am ET (session, Jan-Jun); monthly 1st (off-session, Jul-Dec) | `src/data/bills.json` |
| Scrape Rep Data | `scrape-reps.yml` | Weekly Mon 10am ET (state legislators); monthly 1st (local councils, boundaries) | `src/data/state-legislators.json`, `src/data/local-councils.json`, `public/districts/` |
| Refresh Camera Data | `refresh-camera-data.yml` | Weekly Wed 6am ET | `public/camera-data.json` |

All workflows support `workflow_dispatch` for manual triggering. The rep scraper also accepts a `scope` input to run individual jobs (`state-only`, `local-only`, `boundaries-only`).

### Pushing workflow changes

Pushing files under `.github/workflows/` requires the `workflow` OAuth scope:

```bash
gh auth refresh --hostname github.com --scopes workflow
```
