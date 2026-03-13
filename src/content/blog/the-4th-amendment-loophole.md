---
title: "The 4th Amendment Loophole"
date: 2026-03-08T00:00:00.000Z
summary: "The Supreme Court said the government can't track your movements without a warrant. Then a private company built a system that lets them do it anyway."
tags:
  - 4th-amendment
  - federal-access
  - privacy
  - legislation
draft: false
featuredImage: /blog/4th-amendment-loophole-legislation.png
featuredImageAlt: "The 4th Amendment loophole: legal documents and gavel illustration"
---

## The promise

In 2012, the Supreme Court decided United States v. Jones. The case involved a GPS tracker that police had attached to a suspect's car without a valid warrant. The Court ruled it was an unconstitutional search. Five justices went further, arguing that even collecting public movements over a long enough period amounts to a search under the 4th Amendment.

Six years later, Carpenter v. United States made that argument the law. The government had obtained 127 days of cell-site location data from Timothy Carpenter's wireless carrier, no warrant, just a court order under a lower legal standard. The Supreme Court said that wasn't good enough. Chief Justice Roberts, writing for the majority, recognized that aggregated location tracking reveals what the Court called the "privacies of life." Where you go, over time, tells a story. And the 4th Amendment protects that story from warrantless government access.

Two cases, same principle: the government can't build a map of where you've been without a judge signing off.

For a few years, that looked like settled law.

## The workaround

Carpenter drew a clear line, but it drew it in a specific place. The ruling applies when the government compels a company to hand over data. The wireless carrier didn't choose to share Carpenter's location history. The government demanded it.

So what happens when nobody gets compelled? What if a private company voluntarily builds the surveillance infrastructure, collects the data on its own, and then sells access?

That's exactly how Flock Safety's license plate reader network works. A city buys cameras. Those cameras scan every plate that drives by on public roads. The scan data enters Flock's cloud platform, a shared national network. Any participating agency can search any other agency's data. And anyone who buys a subscription can query the system.

The constitutional protection from Carpenter doesn't apply because the government never ordered the surveillance. A private company built it. <strong class="red">The government just bought a login.</strong>

There's a legal concept called the "third-party doctrine" that courts have used for decades to justify this kind of arrangement. The idea: if you voluntarily share information with a third party (your bank, your phone company), you've given up your expectation of privacy in that information. Carpenter was supposed to be chipping away at that doctrine. The Court explicitly said it doesn't want technological advances to erode constitutional protections.

But the private-company-as-middleman model sidesteps Carpenter entirely. The government isn't compelling anyone. It's just shopping.

## The doors open

In October 2025, the University of Washington Center for Human Rights published a report called "Leaving the Door Wide Open." They'd spent months investigating how federal agencies access local police ALPR data, and they found 3 distinct mechanisms. They gave them names.

**Front door.** A local agency explicitly authorizes data sharing with a federal agency. In Washington state, 8 agencies opened this kind of direct access. At least they knew what they were agreeing to.

**Back door.** Federal agencies access data from local departments that never authorized sharing. In Washington, 10+ agencies were compromised this way, without their knowledge. Flock's own network architecture made it possible. The system was designed so that data sharing could happen at the platform level, regardless of what any individual department thought it had agreed to.

**Side door.** A local officer runs a search on behalf of a federal agent. No federal account needed. No contract. No formal access request. Just one officer querying the system and handing over results. Over 4,000 of these lookups were documented nationally by 404 Media.

The side door is the one that's nearly impossible to prevent. It doesn't require any technical access or special permissions. It just requires a willing local officer. And there's no audit trail that distinguishes a search done for local purposes from one done on behalf of someone else.

Then there's Colorado. In May 2025, a pilot program quietly enrolled 25 police departments in a data-sharing arrangement with federal agencies through the Flock network. None of those departments were told what they'd actually agreed to. When reporters started asking questions, Flock's CEO denied having any federal contracts on camera. Three weeks later, the company issued a written admission.

The point here isn't about any single federal agency or any specific enforcement priority. The point is structural. The system has no guardrails. If one agency can access local surveillance data through the back door or the side door, any agency can. The mechanism is the problem, not the use case. <strong class="red">The same architecture that lets one federal agency run warrantless searches lets every federal agency run warrantless searches.</strong> That's what needs to be stopped.

More than 20 cities have reached the same conclusion. Denver, Cambridge, Evanston, and others have terminated or suspended their Flock contracts specifically because of uncontrolled federal access to local data.

And the harm isn't limited to the federal level. In Greenville, SC, two sisters were held at gunpoint during a traffic stop triggered by an ALPR misidentification. The system flagged their plate. The cops drew weapons. The plate match was wrong. That's the accountability standard for a technology that operates in a legal vacuum.

## The scale

The individual cases are bad enough. The aggregate picture is worse.

In San Jose, California, the EFF documented 261,000+ warrantless ALPR queries in just 14 months. In Virginia, investigators found roughly 3,000 searches on the Flock network tied to federal agency activity over a single year.

In South Carolina, the numbers are staggering. SLED (the State Law Enforcement Division) operates a centralized ALPR database that's been collecting plate scans since at least 2019. Between 2019 and 2022: <strong class="red">422 million license plate reads</strong>. Over <strong class="red">100 million scans per year</strong>. Retained for **3 years**. Accessible to **2,000+ users** across **99+ agencies**. Fort Jackson and Parris Island are listed as contributors. Military installations, feeding data into a system with no statutory authorization.

This is exactly the pattern the Supreme Court flagged in Carpenter. Individual plate scans might seem harmless. One camera catches you driving down Main Street. So what? But aggregated over weeks and months, those scans reveal which church you attend, which doctor you visit, whether you showed up at a political rally, a gun show, a protest, a support group, a custody hearing. The Court called this the "mosaic theory": the whole is more revealing than the parts.

The Court recognized this pattern as constitutionally protected. It's happening anyway.

All of it, every scan, every query, every year of retention, exists <strong class="red">without a single South Carolina statute authorizing it</strong>. No retention limits written into law. No access controls. No warrant requirement. No penalties if someone misuses the data.

## Fighting back

There are two paths to closing this gap: litigation and legislation.

The Institute for Justice is pursuing [IJ v. City of Norfolk](https://ij.org/case/norfolk-alpr/), the first major federal lawsuit directly challenging ALPR data collection under the 4th Amendment. The court has allowed the case to proceed, which means there's at least a plausible constitutional claim that mass plate scanning violates the same principles the Court established in Carpenter and Jones.

But litigation takes years. Discovery, motions, appeals. The data keeps accumulating while the case works its way through the system.

The legislative path could move faster. In South Carolina, [H.4675](/blog/h4675-strongest-alpr-bill-in-sc) was written to close exactly the gaps this post describes. It reads like a point-by-point response to the problems with the current system:

- **Bans third-party cloud storage** of ALPR data, which is the infrastructure that makes the back door possible. If the data can't live on Flock's national network, federal agencies can't query it through that network.
- **Requires a warrant** for law enforcement to access historical plate data. This is the Carpenter principle that courts haven't enforced for ALPR yet, written directly into state law.
- **21-day retention limit**, compared to SLED's current practice of holding data for 3 years with no legal basis.
- **Bans AI-based vehicle tracking** beyond license plates, closing the door on Flock's "Vehicle Fingerprint" feature that identifies cars by make, model, color, and accessories.
- **Quarterly independent audits** by the SC Inspector General, with annual transparency reports.
- **Civil remedies** for individuals whose data is misused: injunctive relief, damages, and attorney's fees.
- **Illegally obtained data is inadmissible** in any proceeding.
- **Existing contracts that violate the law are void** on passage.

The bill is sponsored by 4 Freedom Caucus Republicans. Rep. Todd Rutherford, a Democrat, has been pushing separate ALPR regulation since 2020. When both libertarian conservatives and civil liberties progressives identify the same constitutional problem, it's probably a real one.

Carpenter established the principle 8 years ago. H.4675 would actually enforce it in South Carolina. The bill is sitting in the House Judiciary Committee.

<div class="not-prose my-10 border border-[rgba(255,255,255,0.07)] bg-[#1a1a1a] px-8 py-8 text-center">
  <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#737373] mb-3">Take Action</p>
  <p class="text-[#a3a3a3] text-sm mb-5">Find your city council, county council, and state legislators.</p>
  <button type="button" data-open-action class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 transition-colors cursor-pointer">Find Your Rep</button>
</div>

## Sources

- [Oyez: United States v. Jones (2012)](https://www.oyez.org/cases/2011/10-1259)
- [Oyez: Carpenter v. United States (2018)](https://www.oyez.org/cases/2017/16-402)
- [UWCHR: Leaving the Door Wide Open (Oct 21, 2025)](https://jsis.washington.edu/humanrights/2025/10/21/leaving-the-door-wide-open/)
- [404 Media: ICE taps into nationwide ALPR network (May 2025)](https://www.404media.co/ice-taps-into-nationwide-ai-enabled-camera-network-data-shows/)
- [VCIJ: Virginia Flock surveillance network tapped for immigration cases (Oct 2025)](https://www.whro.org/virginia-center-for-investigative-journalism/2025-09-24/vcij-flock-surveillance-ice-immigration-enforcement)
- [EFF: San Jose can protect immigrants by ending Flock (Feb 2026)](https://www.eff.org/deeplinks/2026/02/op-ed-san-jose-can-protect-immigrants-ending-flock-surveillance-system)
- [9NEWS: Flock admits federal immigration agents have direct access (Aug 2025)](https://www.9news.com/article/news/local/flock-federal-immigration-agents-access-tracking-data/73-a8aee742-56d4-4a57-b5bb-0373286dfef8)
- [Institute for Justice: IJ v. City of Norfolk](https://ij.org/case/norfolk-alpr/)
- [SC Legislature: H. 4675](https://www.scstatehouse.gov/billsearch.php?billnumbers=4675&session=126)
