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

The **/toolkit** page provides four tabs of hands-on advocacy resources:

- **Request Records** -- four ready-to-file SC FOIA letter templates (contracts, retention policies, camera locations, federal data-sharing agreements) with placeholder highlighting, copy-to-clipboard, and PDF download
- **Speak Up** -- public comment preparation for council meetings: a timed 3-minute talk track, seven practical tips, and five pre-written rebuttals to common pushback from elected officials
- **Spread the Word** -- peer-to-peer outreach materials: a one-pager overview, audience-specific conversation starters, print-ready business card designs (PNG + Avery 8371 PDF), and pre-filled social media share links
- **Know Your Rights** -- legal context including a 4th Amendment primer (*Carpenter v. United States*, SC Constitution Article I §10), an interactive state comparison map showing ALPR laws in seven states, and a gap analysis of SC's three pending bills

## Tech Stack

- [Astro 5](https://astro.build) -- static site generator
- [Tailwind CSS 4](https://tailwindcss.com) -- styling
- Python 3.12 -- bill scraper, rep scraper, district boundary builder
- [MapLibre GL JS](https://maplibre.org) + [OpenFreeMap](https://openfreemap.org) -- camera map
- [Deflock CDN](https://deflock.me) -- camera location data
- [Netlify](https://www.netlify.com) -- hosting, auto-deploys from `master`

## Quick Start

**Prerequisites:** Node 22+, Python 3.12+

```bash
git clone https://github.com/TimSimpsonJr/deflocksc-website.git
cd deflocksc-website
npm install
pip install -r requirements.txt
npm run dev
```

Open [localhost:4321](http://localhost:4321).

Scraper data (`bills.json`, `state-legislators.json`, `local-councils.json`) and action letters (`action-letters.json`) ship with the repo. No scraper run is needed to start development.

## Adapting for Your State

This site is built for South Carolina, but the architecture is designed to be forked and localized. High-level checklist:

1. **Fork the repo**
2. **Update site copy and branding** -- swap headlines, FAQ entries, and hero imagery for your state. See [Research Workflow](docs/research-workflow.md).
3. **Configure scrapers** for your state's legislature and local councils. See [Adapting Scrapers](docs/adapting-scrapers.md).
4. **Set up district boundaries** -- generate GeoJSON boundary files for your state's districts. See [Adapting Scrapers: District Boundaries](docs/adapting-scrapers.md#district-boundaries).
5. **Write localized action letters** -- draft template letters for your state's bills. See [Research Workflow: Form Letters](docs/research-workflow.md#form-letters).
6. **Deploy** -- set up Netlify and GitHub Actions. See [Deployment](docs/deployment.md).

## Documentation

- [Architecture](docs/architecture.md) -- site structure, components, data flow
- [Adapting Scrapers](docs/adapting-scrapers.md) -- adding your state's rep data
- [Research Workflow](docs/research-workflow.md) -- creating localized copy and form letters
- [Deployment](docs/deployment.md) -- Netlify, GitHub Actions, environment variables

## Contributing

For manual representative data updates, see [scripts/scrape_reps/CONTRIBUTING.md](scripts/scrape_reps/CONTRIBUTING.md).

For scraper adapters and site features, see [Adapting Scrapers](docs/adapting-scrapers.md).

Issues and PRs welcome.

## License

No license has been declared yet. Contact the maintainer before reusing this code.
