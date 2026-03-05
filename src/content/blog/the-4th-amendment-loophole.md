---
title: "The 4th Amendment Loophole"
date: 2026-03-05T00:00:00.000Z
summary: "The government can't track your movements without a warrant. The Supreme Court said so. But if a private company does the tracking and the government just buys access, the 4th Amendment doesn't apply. That's the loophole."
tags:
  - 4th-amendment
  - federal-access
  - privacy
  - legislation
draft: false
---

In 2018, the Supreme Court ruled in Carpenter v. United States that the government needs a warrant to access your cell phone location data. The reasoning: aggregated location tracking reveals the "privacies of life," and the 4th Amendment protects against that kind of warrantless government surveillance.

That should have settled things. It didn't.

## The workaround

The Carpenter decision applies when the government directly compels a company to hand over data. But what if the government doesn't compel anything? What if a private company voluntarily collects the data, builds a searchable database, and then sells access?

That's exactly how Flock Safety works. Cities buy cameras. The cameras scan license plates on public roads. The data enters a shared network. Federal agencies get access to that network, and suddenly the government knows everywhere you've been, without ever getting a warrant.

The constitutional protection from Carpenter doesn't kick in because the government didn't order the surveillance. A private company did. The government just bought a subscription.

## Three doors

The University of Washington Center for Human Rights documented how this works in practice. They found 3 distinct ways federal agencies access local ALPR data, and gave them names:

**Front door:** A local agency explicitly authorizes data sharing with CBP or ICE. In Washington state, 8 agencies opened direct access. At least they knew what they were doing.

**Back door:** CBP accesses data from agencies that never authorized sharing. In Washington, 10+ agencies were compromised without their knowledge. Flock's own architecture made this possible.

**Side door:** A local officer runs a search on behalf of a federal agent. No federal account needed. No contract. No formal access request. Just one officer searching the system and handing over the results. Over 4,000 immigration-related "side door" lookups were documented nationally by 404 Media.

The side door is the one that's nearly impossible to prevent. It doesn't require any technical access. It just requires a willing local officer. And there's no audit trail that distinguishes a search done for local purposes from one done on behalf of ICE.

## The numbers

In Virginia, investigators found roughly 3,000 immigration-related searches on the Flock network over a 12-month period. The search terms included "ICE," "ERO," and "deportee." In San Jose, California, the EFF documented 261,000+ warrantless ALPR queries in just 14 months.

In Colorado, 25 police departments were sharing data with CBP through a secret Flock pilot program that started in May 2025. None of those departments were told what they'd agreed to. Flock's CEO denied having any federal contracts on camera, then issued a written admission 3 weeks later.

The Institute for Justice is pursuing federal litigation in IJ v. City of Norfolk, a case that directly challenges ALPR data collection under the 4th Amendment. The court has allowed the case to proceed, which means there's at least a plausible constitutional claim. But litigation takes years.

## Why "I have nothing to hide" doesn't hold up

Plate scans record where you go. Over time, that builds a picture: which church you attend, which doctor you visit, whether you showed up at a political rally, a gun show, a protest, a support group, a custody hearing.

The Supreme Court recognized this in Carpenter. Individual data points might be innocuous. Aggregated over weeks and months, they reveal patterns that most people consider deeply private. The Court called this the "mosaic theory": the whole is more revealing than the parts.

SLED's database holds **422 million** license plate reads from 2019 to 2022. That's 100 million+ scans per year across South Carolina. Retained for 3 years. Accessible to 2,000+ users across 99+ agencies. Fort Jackson and Parris Island are listed as contributors.

All of this exists without a single state statute authorizing it. No retention limits. No access controls. No warrant requirement. No penalties if someone misuses it.

## What SC could do

Three bills in the SC Legislature would start to close this gap:

**S. 447** and **H. 3155** offer the strongest protections: visual confirmation before ALPR-based traffic stops, 90-day data retention, prohibition on selling data, misdemeanor penalties for violations.

**H. 4013** includes similar protections with 5 co-sponsors across districts.

All 3 bills share the same hole: **none of them restrict federal agency access to SC ALPR data**. No provision blocks ICE, CBP, or any other federal agency from querying the movements of SC residents. Illinois has that protection. South Carolina doesn't, and these bills wouldn't add it.

That's worth pushing on. But even without the federal access provision, any of these bills would be a significant step: retention limits, access controls, penalties for abuse. The 4th Amendment fight will take years in court. The legislative fix could happen this session.

If your rep sits on Judiciary or Education & Public Works, they have a say.

<div class="flex justify-center my-10">
  <button type="button" data-open-action class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors cursor-pointer">Find Your Rep</button>
</div>

## Sources

- [Oyez: Carpenter v. United States (2018)](https://www.oyez.org/cases/2017/16-402)
- [UWCHR: Leaving the Door Wide Open (Oct 21, 2025)](https://jsis.washington.edu/humanrights/2025/10/21/leaving-the-door-wide-open/)
- [404 Media: ICE taps into nationwide ALPR network (May 2025)](https://www.404media.co/ice-taps-into-nationwide-ai-enabled-camera-network-data-shows/)
- [VCIJ: Virginia Flock surveillance network tapped for immigration cases (Oct 2025)](https://www.whro.org/virginia-center-for-investigative-journalism/2025-09-24/vcij-flock-surveillance-ice-immigration-enforcement)
- [EFF: San Jose can protect immigrants by ending Flock (Feb 2026)](https://www.eff.org/deeplinks/2026/02/op-ed-san-jose-can-protect-immigrants-ending-flock-surveillance-system)
- [9NEWS: Flock admits federal immigration agents have direct access (Aug 2025)](https://www.9news.com/article/news/local/flock-federal-immigration-agents-access-tracking-data/73-a8aee742-56d4-4a57-b5bb-0373286dfef8)
- [Institute for Justice: IJ v. City of Norfolk](https://ij.org/case/norfolk-alpr/)
- [SC Legislature: S. 447](https://www.scstatehouse.gov/billsearch.php?billnumbers=447&session=126)
- [SC Legislature: H. 3155](https://www.scstatehouse.gov/billsearch.php?billnumbers=3155&session=126)
- [SC Legislature: H. 4013](https://www.scstatehouse.gov/billsearch.php?billnumbers=4013&session=126)
