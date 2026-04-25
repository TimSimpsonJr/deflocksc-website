---
title: "Time Is Running Out to Fix SC's Flock Regulation Bill"
date: 2026-04-24T00:00:00.000Z
summary: "S.447 cleared Senate Judiciary on April 9. Five floor amendments would close the gap between this bill and real ALPR regulation before the Senate vote."
tags:
  - legislation
  - sc
  - privacy
  - s447
  - alpr
draft: false
---

In August 2020, Brittney Gilliam drove her 6-year-old daughter, her 17-year-old sister, and two nieces (12 and 14) to get their nails done in Aurora, Colorado. A license plate reader flagged her SUV as a match for a stolen motorcycle with Montana plates. Officers didn't notice that the plate reader had matched a different state and a different kind of vehicle. They pulled the family out of the car at gunpoint, handcuffed Gilliam, her sister, and the 12-year-old, and made the 6-year-old and 14-year-old lie face-down on the pavement with their hands over their heads. The city of Aurora later paid them $1.9 million.

License plate readers work as networks, and each camera feeds a database that syncs with other agencies and sometimes across state lines, and every plate scan becomes part of a record of where each car has been. Flock Safety runs a national version of that network. South Carolina's state police, SLED, runs a state version with over 430 million records. These systems are built for speed. An alert goes out the instant a reader returns a match, and an officer can act on it before anyone verifies the match. The cost of that speed falls on whoever the system happens to be pointed at. A 6-year-old got put face-down on the pavement in Aurora that way.

Four South Carolina bills filed this session propose limits on how plate readers can be used. Their sponsors include Freedom Caucus Republicans, a Democratic civil rights attorney, and a Senate Republican. The consensus is bipartisan, which almost never happens on hot-button issues in South Carolina.

To actually constrain what the network does, regulation has to hit six pressure points. Require data to be stored on servers owned by state government, physically located in the state. Limit how long any scan is retained (90 days is the industry's default; 21 days is the privacy standard). Require a judge's approval before an officer pulls up historical records of where a car has been. Block the pipeline that lets federal agencies query state data without a warrant. Ban AI that identifies cars by anything beyond the license plate itself. And require independent audits, because agencies can't be trusted to grade their own homework.

The strongest of the four bills, [H.4675](/blog/h4675-strongest-alpr-bill-in-sc), covers every pressure point. It's stuck in committee with no hearing scheduled, and a weaker bill is moving instead. S.447 cleared Senate Judiciary on April 9 and is now awaiting a Senate floor vote. The state's legislative session ends on May 14, which is three weeks away. If S.447 passes as written, it becomes South Carolina's first ALPR law. It also becomes a wall for every stronger bill that comes after.

## What S.447 does, and what it leaves out

S.447 is the bill awaiting a Senate floor vote. Sen. Brian Adams (R-District 44) is its sponsor. Before walking through what's missing from it, here's what it does.

S.447 sets a 90-day retention limit for plate scan data and requires agencies to adopt a written policy covering oversight and audit practices. It makes unauthorized use a misdemeanor punishable by a fine and up to two years in prison, requires an officer to visually verify a plate match before conducting a traffic stop on an alert, creates a permitting process for cameras on non-interstate roads, and prohibits any authorized agency from selling ALPR data. South Carolina currently has no law governing ALPR use at all.

S.447 says nothing about cloud storage (the core of Flock Safety's business model, where plate data lives on private servers outside South Carolina), nothing about AI analysis of vehicle features beyond the plate itself (Flock's Vehicle Fingerprint identifies cars by body damage, decals, silhouettes, and paint patterns), and nothing about federal agencies querying state ALPR data. No warrant is required for historical database searches, no independent auditor oversees what agencies are doing, and data obtained in violation of the bill's rules can still be used against a defendant in court. A resident has no private right of action.

In statutory interpretation, silence on a practice reads as permission to continue it.

<div class="not-prose my-10 overflow-x-auto">
  <table class="w-full min-w-[640px] border-collapse text-[15px]">
    <thead>
      <tr class="border-b border-[rgba(255,255,255,0.15)]">
        <th class="text-left text-[#e8e8e8] font-bold py-3 pr-4 align-bottom">What's at stake</th>
        <th class="text-left text-[#e8e8e8] font-bold py-3 px-4 align-bottom">
          H.4675
          <div class="text-[#a0a0a0] font-normal text-xs uppercase tracking-wider mt-0.5">Strong regulation</div>
        </th>
        <th class="text-left text-[#e8e8e8] font-bold py-3 pl-4 align-bottom">
          S.447
          <div class="text-[#a0a0a0] font-normal text-xs uppercase tracking-wider mt-0.5">Bill on the floor</div>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">Data retention</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">21 days, automatic deletion</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">90 days, codified as baseline</td>
      </tr>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">Cloud storage on private servers</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Banned; contrary contracts void as against public policy</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">Permitted (bill is silent)</td>
      </tr>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">AI vehicle-feature recognition</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Banned; ALPRs limited to plate, time, date, and location</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">Permitted (bill is silent)</td>
      </tr>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">SLED centralized database</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Subject to same retention, access, and storage rules as every other agency</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">Explicitly authorized (§23-1-235(D)(1))</td>
      </tr>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">Federal agency access</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Blocked; in-state storage required; immigration enforcement explicitly prohibited</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">Not addressed</td>
      </tr>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">Warrant for historical queries</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Required; emergency access must reach a judge within 24 hours</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">Not required</td>
      </tr>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">Independent oversight</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Quarterly audits by SC Inspector General</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">Self-audit by the agency using the system</td>
      </tr>
      <tr class="border-b border-[rgba(255,255,255,0.07)]">
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">Private right of action</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Residents can sue for injunctive relief, damages, and attorney's fees</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">None</td>
      </tr>
      <tr>
        <td class="text-[#e8e8e8] py-3 pr-4 align-top font-semibold">Exclusionary rule</td>
        <td class="text-[#a0a0a0] py-3 px-4 align-top">Data obtained in violation inadmissible in any proceeding</td>
        <td class="text-[#dc2626] py-3 pl-4 align-top">None</td>
      </tr>
    </tbody>
  </table>
</div>

One provision in S.447 outweighs everything else in that chart. It's buried in subsection (D)(1).

<blockquote class="not-prose my-8 bg-[#1a1a1a] border-l-4 border-[#dc2626] px-6 py-6">
  <p class="text-[#e8e8e8] text-base italic">"...including the operation and maintenance of an automatic license plate reader database by SLED."</p>
  <p class="text-[#a0a0a0] text-sm mt-3">S.447, §23-1-235(D)(1)</p>
</blockquote>

SLED currently runs an ALPR database containing over 430 million records of where South Carolinians have driven. The database has no statute authorizing its existence. The South Carolina Public Interest Foundation sued SLED in 2023 on that exact ground, and the summary judgment briefing is complete. A ruling could come any time. More on that lawsuit [here](/blog/scpif-v-sled-explainer).

If S.447 passes with subsection (D)(1) intact, the Governor's signature gives SLED the authorization the lawsuit argues it never had. The most legally actionable argument against the SLED database dies on the day the bill becomes law. Subsection (D)(1) is statutory cover dressed as regulation.

## The half-measure trap

Most weak laws become stepping stones. You pass something, it sets a floor, and the next session you push for more. Workplace safety laws got teeth that way. Environmental regulation built itself one administration at a time. The intuition that any regulation is better than none rests on this pattern.

S.447 breaks that pattern in four ways.

It sets the anchor. Once 90-day retention is the codified baseline, advocacy to move to 21 days has to overcome the institutional weight of a recently-enacted compromise. "We just passed this" is one of the hardest arguments to dislodge in a body that prizes consistency.

Once the legislature passes an ALPR framework, the practices it doesn't address face a structural presumption. If lawmakers had wanted to regulate cloud storage, AI tracking, or federal sharing, they would have included them. Silence becomes permission.

The SLED clause provides statutory cover. The pending SCPIF v. SLED lawsuit's strongest argument depends on the absence of legislative authorization for the SLED database. S.447 supplies the authorization. The lawsuit's cleanest claim dies on the day the Governor signs.

The politics harden. Law enforcement, sheriffs' associations, and Flock Safety currently defend an unauthorized status quo. After S.447, they defend a statute. Future reform requires unwinding S.447 first.

That's the half-measure trap. The weaknesses in S.447 overlap into a single permissive frame. The 90-day retention authorizes one practice, the silences authorize others, and the SLED clause authorizes the database that holds it all. Once enacted, the structure becomes a unit. Repealing it means unwinding all four overlapping permissions at once, against the institutional weight of SLED defending its database, and a legislature that will be resistant to improving protections in the bill it just passed.

Industry lobbying typically produces statutes shaped this way. (Whether by design or accident, the architecture is the same.) The bill regulates in name and authorizes in substance. The result gives law enforcement and ALPR vendors the legitimacy of legislation without the constraints of real regulation.

If the bill passes as written, the trap closes. Five floor amendments would prevent it.

## Five floor amendments that would close the gap

S.447 is on the Senate's Second Reading Calendar, which means any senator can rise and offer floor amendments before the vote. Five amendments in particular would close the gap between this bill and real regulation.

<div class="not-prose my-8 flex flex-col gap-3">
  <div class="bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] px-6 py-6 flex gap-5 items-start">
    <div class="text-[32px] font-bold text-[#dc2626] leading-none shrink-0 w-9 text-center">1</div>
    <div>
      <p class="text-[#e8e8e8] font-bold text-base mb-1.5">Strike the SLED database authorization</p>
      <p class="text-[#a0a0a0] text-[15px] leading-relaxed">Delete the phrase "including the operation and maintenance of an automatic license plate reader database by SLED" from §23-1-235(D)(1). Without it, S.447 still regulates ALPR use, but it stops legitimizing the database that's currently being challenged in court. The pending SCPIF v. SLED lawsuit's strongest argument survives. If the legislature does NOT strike that phrase, SLED gets a statutory defense it doesn't currently have, the SCPIF case weakens, and the strongest check on the database disappears before a judge has ruled. No other amendment on this list affects the lawsuit.</p>
    </div>
  </div>
  <div class="bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] px-6 py-6 flex gap-5 items-start">
    <div class="text-[32px] font-bold text-[#dc2626] leading-none shrink-0 w-9 text-center">2</div>
    <div>
      <p class="text-[#e8e8e8] font-bold text-base mb-1.5">Require state-owned, in-state servers</p>
      <p class="text-[#a0a0a0] text-[15px] leading-relaxed">Add language requiring all ALPR data to live on servers owned by South Carolina government entities and physically located in the state. Any contract that violates this is void as against public policy. Flock Safety's entire business model (cloud SaaS on out-of-state infrastructure) is built on the gap S.447 leaves open. This amendment voids every Flock contract in South Carolina the moment the bill becomes law.</p>
    </div>
  </div>
  <div class="bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] px-6 py-6 flex gap-5 items-start">
    <div class="text-[32px] font-bold text-[#dc2626] leading-none shrink-0 w-9 text-center">3</div>
    <div>
      <p class="text-[#e8e8e8] font-bold text-base mb-1.5">Block federal agency access</p>
      <p class="text-[#a0a0a0] text-[15px] leading-relaxed">Add language prohibiting state and local agencies from sharing ALPR data with federal agencies (ICE, DEA, FBI) absent a valid warrant or court order. The bill as written says nothing about federal access. When a law doesn't ban something, the practice is allowed by default. A bill meant to limit ALPR use ends up authorizing every federal query the architecture supports. Cities have already canceled Flock contracts over this. S.447 reopens the pipeline.</p>
    </div>
  </div>
  <div class="bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] px-6 py-6 flex gap-5 items-start">
    <div class="text-[32px] font-bold text-[#dc2626] leading-none shrink-0 w-9 text-center">4</div>
    <div>
      <p class="text-[#e8e8e8] font-bold text-base mb-1.5">Require warrants for historical searches</p>
      <p class="text-[#a0a0a0] text-[15px] leading-relaxed">Require a search warrant for historical ALPR data access. Real-time hot list alerts stay automated. Emergency historical queries are allowed only when documented within 24 hours and reviewed by a judge. Every individual scan is mundane, but the aggregate is a record of movement that should require a judge's approval to access.</p>
    </div>
  </div>
  <div class="bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] px-6 py-6 flex gap-5 items-start">
    <div class="text-[32px] font-bold text-[#dc2626] leading-none shrink-0 w-9 text-center">5</div>
    <div>
      <p class="text-[#e8e8e8] font-bold text-base mb-1.5">Cut retention from 90 days to 30</p>
      <p class="text-[#a0a0a0] text-[15px] leading-relaxed">S.447 sets retention at 90 days. H.4675 sets it at 21. Thirty days splits the difference and is defensible operationally while constraining the historical record of movement. Every additional day of retention is another day of movement record available without a warrant.</p>
    </div>
  </div>
</div>

The fixes exist and are specific enough that any senator could file them today. What they won't do is file them without a reason to.

## Contact your state senator

S.447 cleared the Senate Judiciary Committee on April 9 and now awaits a floor vote. When it comes up, any senator can offer floor amendments.

Those amendments don't get filed unless constituents are asking for them specifically.

The vote could come any day in the next three weeks. If S.447 passes as written, the half-measure trap closes.

<div class="not-prose my-10 border border-[rgba(255,255,255,0.07)] bg-[#1a1a1a] px-8 py-8 text-center">
  <p class="label-mono-heading mb-3">Take Action</p>
  <p class="text-[#a3a3a3] text-sm mb-5">Find the state senator who represents you. When you call or email, ask them to support these five floor amendments to S.447:</p>
  <ul class="text-left text-[#a3a3a3] text-sm mb-6 max-w-md mx-auto list-disc list-inside space-y-1">
    <li>Strike the SLED database authorization</li>
    <li>Require state-owned, in-state servers for ALPR data</li>
    <li>Block federal agency access without a warrant</li>
    <li>Require warrants for historical database searches</li>
    <li>Cut retention from 90 days to 30</li>
  </ul>
  <button type="button" data-open-action data-open-action-filter="state-senator" class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 transition-colors cursor-pointer">Find Your Senator</button>
</div>

If you've never called a senator before, the [action guide](/blog/how-to-fight-alpr-surveillance-sc) has the script.

## Sources

- [SC Legislature: S.447](https://www.scstatehouse.gov/sess126_2025-2026/bills/447.htm)
- [S.447 April 9, 2026 committee version](https://www.scstatehouse.gov/sess126_2025-2026/prever/447_20260409.htm)
- [Senate Journal April 9, 2026 (favorable report)](https://www.scstatehouse.gov/sess126_2025-2026/sj26/20260409.htm)
- [SC Legislature: H.4675](https://www.scstatehouse.gov/sess126_2025-2026/bills/4675.htm)
- [Policing Project: SCPIF v. SLED](https://www.policingproject.org/south-carolina-license-plate-reader-lawsuit)
- [NBC News: Black family receives $1.9M settlement after Aurora police held them at gunpoint](https://www.nbcnews.com/news/us-news/black-family-was-removed-car-gunpoint-handcuffed-aurora-colorado-polic-rcna137444)
- [9News: Family wrongfully held at gunpoint gets $1.9 million settlement](https://www.9news.com/article/news/local/aurora-family-gunpoint-settlement-viral-video/73-80fa3eed-1b6d-420b-ad01-73292ed6425d)
