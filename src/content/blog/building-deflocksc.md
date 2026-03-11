---
title: "Why We Built DeflockSC"
date: 2026-03-04T00:00:00.000Z
summary: "Why we built this site, what we're trying to do with it, and the problems we had to solve along the way."
tags:
  - launch
  - campaign
featuredImage: /blog/sc-county-map.png
draft: false
---

Welcome to DeflockSC. If you're reading this, you've probably already poked around the homepage. You've seen the camera map, the bill tracker, the rep finder. This post is about why all of that exists, and what we ran into while building it.

## What we're trying to do

DeflockSC has one job: make it easy for SC residents to push back against unregulated license plate surveillance.

We give people the information (where are the cameras, what bills are pending, who represents them) and then strip out the friction between knowing and acting. Find your rep, read a letter we already wrote for you, hit send.

We're not a news outlet, but we will be posting updates here as things develop. When relevant reporting comes out, when bills move (or don't), when local councils take action, we'll cover it. This site is first and foremost a tool, though. It's pointed at specific bills, specific jurisdictions, specific elected officials. If those bills pass or fail, we'll adapt. If other states want to run the same play, the code is open source.

The long-term goal is enough constituent pressure to get the 3 pending bills out of committee and get local councils asking hard questions about their own Flock contracts. Whether that works, we don't know yet. But nobody was going to stumble into emailing their county council member about camera data policies on their own. The path had to be built.

## Why it's built this way

The site has no server, no database, no user accounts. It's just a collection of pre-built pages. Your browser does the work of figuring out your district and matching you to your reps.

A site about surveillance shouldn't be collecting data on the people using it. If you share your location, that information never leaves your browser. If you type an address, it gets sent to the US Census Bureau's geocoding service to figure out your census district, but it never touches our servers. District matching happens entirely on your device. The only thing we track is the number of clicks the "Take Action" and "Email Your Rep" buttons get, so we know how the site is actually getting used.

We also built it this way because it needed to be cheap to run, hard to break, and easy for someone else to copy. There's nothing to hack because there's nothing running. If we disappear tomorrow, the site keeps working.

## The problems we had to solve

### Figuring out your district

The original plan was to use a Google API that matches addresses to legislative districts. Google killed it. So we had to build that ourselves, and it had to work entirely in your browser without sending your location to our servers (because we don't have servers).

We download official boundary maps from the Census Bureau (for state districts) and county GIS portals (for local council districts), shrink them down to a manageable size, and bundle them with the site. When you enter your address or share your location, your browser checks those maps to figure out which districts you're in.

3 ways to find your district: share your location, type an address, or just pick from dropdowns. We built all 3 because none of them work for everyone.

### Collecting rep data from 30+ government websites

State legislator info was easy. There's a nonprofit called OpenStates that publishes it in a clean, standardized format.

Local council data was a different story. Every county and city in SC has its own website with its own layout. Some hide email addresses behind JavaScript tricks. Some don't list individual contact info at all.

We wrote a system that knows how to scrape each type of site. About a third of SC's local governments use the same website platform (CivicPlus), so one scraper handles all of those. The rest get custom scrapers, or we enter the data by hand when there's no other option.

Adding a new jurisdiction is mostly a config change. We want to make it easy for contributors to expand the coverage.

### Keeping the map free

We started with Mapbox for the camera map, but that came with API keys and usage limits. We switched to OpenFreeMap, which is free and open. Camera locations come from Deflock.org, which already tracks ALPR cameras nationwide. A weekly script grabs the latest data so the map stays current.

### Letters that actually say something

There are 85 template letters on the site now: 2 statewide, 46 county-specific, 36 city-specific, and 1 fallback for jurisdictions we haven't covered yet. Each one is loaded with facts pulled from that jurisdiction's own backyard.

The Greenville City letter mentions 57 cameras and the incident where 2 sisters were pulled over at gunpoint after a Flock camera misread their rental car's plate. The Spartanburg letter brings up the former sheriff's federal conviction. The Lancaster letter cites 50 cameras across a county of 100,000 people.

We researched all 46 SC counties, organized the findings with citations, and turned those notes into the letters and FAQ entries you see on the site. The research workflow is documented in the repo if you want to see how the sausage gets made.

### The citizen toolkit

The same research that fed the letters also fed the [citizen toolkit](/toolkit). We kept running into the same question: what do you actually *do* once you know about the cameras?

So we built 4 toolkits and bolted them onto the site:

**FOIA templates.** 4 ready-to-file records requests covering camera locations, data retention policies, federal data sharing agreements, and the actual Flock contract your city signed. All formatted for SC's Freedom of Information Act (§ 30-4-10). Copy, paste, send.

**Council meeting prep.** Talking points, sample questions, and a rundown of how public comment periods work in SC. Most people have never spoken at a council meeting. We tried to make it less intimidating.

**Outreach materials.** Flyers, social media graphics, and email templates for organizing in your community. If you want to get your neighbors asking questions too, the assets are there.

**Legal resources.** A plain-language breakdown of your rights around ALPR surveillance, what the law currently says (not much), and what the 3 pending bills would change.

The toolkit came together because we kept finding material that didn't fit in a letter but was too useful to leave on the cutting room floor. It's the same research pipeline, just pointed at a different output.

## Fork it

The site is open source, and we wrote documentation specifically for people who want to adapt it for their own state. Camera surveillance is a national problem. Flock Safety alone operates in over 5,000 communities. If your state doesn't have oversight legislation, these tools can work for you too.

Code: [github.com/TimSimpsonJr/deflocksc-website](https://github.com/TimSimpsonJr/deflocksc-website)
