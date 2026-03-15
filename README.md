# DeflockSC

Static advocacy site tracking automated license plate reader (ALPR) surveillance in South Carolina.

**Live site:** [deflocksc.org](https://deflocksc.org)

## What This Site Does

The homepage has six sections:

- **Hero** -- camera imagery and headline framing the surveillance problem
- **How It Works** -- carousel explaining what ALPRs are, how they track movement, and why it matters
- **Camera Map** -- interactive MapLibre GL map showing ALPR camera locations across SC, powered by Deflock CDN data
- **Bill Tracker** -- current SC legislation related to ALPR regulation, scraped from scstatehouse.gov
- **FAQ** -- sourced answers to common questions about ALPRs and privacy
- **Take Action** -- call to action driving visitors to contact their representatives

The **action modal** is the core engagement tool. A visitor enters their location via geolocation, street address (Census geocoder), or manual dropdown. The site matches them to their state legislative and local council districts using client-side boundary files, looks up their representatives, and presents pre-written template letters they can send. Letters are locally tailored -- 85 templates cover all 46 SC counties with jurisdiction-specific facts, camera counts, and incident references.

The **/toolkit** pages provide hands-on advocacy resources across four subpages:

- **Request Records** -- four ready-to-file SC FOIA letter templates with placeholder highlighting, copy-to-clipboard, and PDF download
- **Speak Up** -- public comment preparation for council meetings: a timed 3-minute talk track, seven practical tips, and five pre-written rebuttals
- **Spread the Word** -- peer-to-peer outreach materials: a one-pager overview, conversation starters, business cards, and social media share links
- **Know Your Rights** -- legal context including a 4th Amendment primer, an interactive state comparison map, and a gap analysis of SC's pending bills

## Tech Stack

- [Astro 5](https://astro.build) -- static site generator
- [Tailwind CSS 4](https://tailwindcss.com) -- styling
- [open-civics](https://www.npmjs.com/package/open-civics) -- state legislator and local council data
- [open-civics-boundaries](https://www.npmjs.com/package/open-civics-boundaries) -- district boundary GeoJSON for client-side matching
- [MapLibre GL JS](https://maplibre.org) + [OpenFreeMap](https://openfreemap.org) -- camera map
- [Deflock CDN](https://deflock.me) -- camera location data
- Python 3.12 -- bill scraper
- [Netlify](https://www.netlify.com) -- hosting, auto-deploys from `master`

## Quick Start

**Prerequisites:** Node 22+, Python 3.12+ (for bill scraper only)

```bash
git clone https://github.com/TimSimpsonJr/deflocksc-website.git
cd deflocksc-website
npm install
npm run dev
```

Open [localhost:4321](http://localhost:4321).

Representative data is pulled from npm packages at build time. Bill data (`bills.json`) and action letters (`action-letters.json`) ship with the repo. No scraper run is needed to start development.

For the bill scraper:

```bash
pip install -r requirements.txt
python scripts/scraper.py
```

## Adapting for Your State

This site is built for South Carolina, but the architecture is designed to be forked and localized. High-level checklist:

1. **Fork the repo**
2. **Update site copy and branding** -- swap headlines, FAQ entries, and hero imagery for your state. See [Research Workflow](docs/research-workflow.md).
3. **Fork the open-civics repo** and add your state's legislator and council data. See [Adapting Data Sources](docs/adapting-scrapers.md).
4. **Update the bill scraper** for your state's legislature website. See [Adapting Data Sources: Bill Scraper](docs/adapting-scrapers.md#bill-scraper).
5. **Write localized action letters** -- draft template letters for your state's bills. See [Research Workflow: Form Letters](docs/research-workflow.md#form-letters).
6. **Deploy** -- set up Netlify and GitHub Actions. See [Deployment](docs/deployment.md).

## Documentation

- [Architecture](docs/architecture.md) -- site structure, components, data flow
- [Adapting Data Sources](docs/adapting-scrapers.md) -- rep data, bill scraper, camera data
- [Research Workflow](docs/research-workflow.md) -- creating localized copy and form letters
- [Deployment](docs/deployment.md) -- Netlify, GitHub Actions, environment variables

## Contributing

Issues and PRs welcome. See the [PR template](.github/pull_request_template.md) for the action modal smoke test checklist.

## License

No license has been declared yet. Contact the maintainer before reusing this code.
