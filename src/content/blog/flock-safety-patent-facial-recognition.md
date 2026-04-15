---
subtitle: What Patent US11416545B1 Says About the Cameras on Your Roads
featuredImageAlt: Flock Safety patent US11416545B1 describing facial recognition and demographic classification capabilities vs. company marketing denial
title: Flock Told the Patent Office One Thing. They Tell Your City Another.
date: 2026-03-27T00:00:00.000Z
summary: 'Flock Safety says their cameras don''t identify race, gender, or ethnicity. Patent US11416545B1, granted in August 2022, describes a system that does exactly that. Every Flock camera in South Carolina is hardware that could run this software. No SC law prevents it.'
tags:
  - flock-safety
  - privacy
  - research
  - sc
  - patents
draft: false
featuredImage: /uploads/blog/flock-safety-patent-facial-recognition.png
---

Flock Safety's [discrimination FAQ](https://www.flocksafety.com/blog/are-flock-products-discriminatory/) says their system "targets only vehicles linked to crime, not individuals or protected characteristics." Their product page says the cameras don't use facial recognition. Their reps tell city councils the same thing.

However, [Patent US11416545B1](https://patents.google.com/patent/US11416545B1/en), granted to Flock Group Inc. in August 2022, describes a system that classifies people by race, gender, estimated height and weight, clothing, and facial recognition data points. It describes neural networks trained to do this automatically. It describes searching archived footage by those characteristics across multiple camera locations.

Flock operates over 1,000 cameras in South Carolina. Those cameras feed [SLED's statewide database](/blog/scpif-v-sled-explainer), which holds 422 million plate reads with 3-year retention, accessible to 2,000+ users across 99+ agencies. Zero state laws govern what analysis Flock can run on that data.

## What the patent actually says

Patent US11416545B1 was filed on October 4, 2020 and granted on August 16, 2022. The assignee is Flock Group, Inc., the same corporate entity that sells cameras to your city and county.

The patent describes what it calls "object-based queries" of video surveillance content. That means searching recorded footage not just by license plates, but by the physical characteristics of people captured on camera.

The primary claims use this language.

> A neural network may be trained to detect characteristics and features of an object, such as race, gender, ethnicity, height, weight, and clothing.

That language sits in the patent's primary claims. It's what the entire filing exists to protect.

The system goes further. It describes tracking individuals across multiple camera locations using "statistical similarity," matching a person's physical profile from one camera feed to another without needing to identify them by name. Cross-camera person tracking by body type, clothing, and demographic characteristics.

<strong class="red">The patent describes searching archived surveillance footage by race, gender, height, weight, and clothing, then tracking those people across cameras.</strong>

The filing also describes what it calls "facial recognition data points" as part of the system's classification toolkit. These are biometric measurements taken from faces captured on camera, fed into the same neural networks that classify race and gender.

Patents are filed under penalty of perjury. A sworn technical description of what Flock built, submitted to the US government so they could protect it as their intellectual property.

Patent law requires sworn accuracy. The FAQ is written to sell cameras. The patent is written to stake a legal claim, and lying in it can void the protection. When the marketing page says "we don't identify race" and the patent says "neural networks classify people by race," the patent is the sworn document, and nobody goes to prison for a misleading FAQ.

Every Flock camera in South Carolina is hardware designed to run this software, and the patent says so in writing.

## What the cameras already do

Flock's [FreeForm AI](https://www.flocksafety.com/products/flock-freeform) product is already active on cameras across the country. It lets officers type natural language queries ("man in blue shirt near Main Street") and search across video and license plate data simultaneously. Results come back in real time. Alerts fire across the entire camera network. Agencies share access.

FreeForm already does some of what the patent describes. Here's how the capabilities line up:

| Capability | Patent | FreeForm AI | Flock says publicly |
| --- | --- | --- | --- |
| License plate capture | Yes | Yes | Yes |
| Vehicle make/model/color | Yes | Yes | Yes |
| Body type / clothing | Yes | Yes | "Vehicle Fingerprint" |
| Height / weight estimation | Yes | No (public) | No mention |
| Gender classification | Yes | No (public) | "We don't identify gender" |
| Race / ethnicity classification | Yes | No (public) | "We don't identify race" |
| Facial recognition data points | Yes | No (public) | "We do not use facial recognition" |
| Cross-camera person tracking | Yes | No (public) | "Point-in-time images only" |

Flock has patented all of them. FreeForm already handles body type and clothing classification. <strong class="red">The gap between what FreeForm does today and what the patent describes is one software update away.</strong>

Flock can push the update without new cameras, new contracts, new votes, or any notification to the city. One server push, and the cameras on your street corner start classifying people by race. Call it the silent switch.

## What Flock says vs. what Flock filed

Flock holds two contradictory positions at the same time. Call it the duplicity dynamic.

**Position 1 (marketing):** The [discrimination FAQ](https://www.flocksafety.com/blog/are-flock-products-discriminatory/) says cameras target "only vehicles linked to crime, not individuals or protected characteristics." The FreeForm product page says the system "does not use facial recognition technology."

**Position 2 (patent):** US11416545B1 explicitly describes neural networks that classify people by race, gender, ethnicity, height, and weight. It describes facial recognition data points as an input to those classifiers. It describes searching footage by these characteristics and tracking people across camera locations.

A company doesn't file for patent protection on capabilities it never intends to deploy. Patent prosecution costs tens of thousands of dollars between attorney fees, filing fees, examination, and response drafting. A utility patent of this scope typically runs $15,000 to $50,000 in legal costs alone, plus two to three years of negotiating claim language with patent examiners. Companies spend that kind of resource to protect infrastructure they've built and plan to use.

<strong class="red">Flock told the US Patent Office their system classifies people by physical characteristics. They tell your city council it doesn't.</strong>

Which position governs what happens to 422 million plate reads in SLED's database? Which one did your county council vote on?

They didn't vote. If you're in Greenville, we've documented how that works in [Bought With Your Money](/blog/greenville-flock-contracts).

## Your contract doesn't protect you

We've already broken down Greenville's Flock contract clause by clause in our [Greenville contracts analysis](/blog/greenville-flock-contracts). Two clauses matter here.

**Section 2.12** says Flock can push "any upgrades to the system or platform that it deems necessary or useful" without the city's consent, as long as the upgrades don't "materially change any terms or conditions" of the contract.

The city has no veto and no notification right. Flock decides what's necessary or useful. Flock decides whether the upgrade materially changes the terms.

<strong class="red">The contract lets Flock activate patented capabilities, including demographic classification and facial recognition, without council approval, without public notice, without renegotiating.</strong>

**Section 4.5** grants Flock a "non-exclusive, worldwide, perpetual, royalty-free right (during and after the Term)" to use anonymized customer data. "After the Term" means even if Greenville canceled tomorrow, Flock keeps the right to use the data it already collected.

Greenville's contract is representative of Flock contracts across South Carolina. But some jurisdictions have even less oversight. Florence County [installed Flock cameras on private property](https://wpde.com/news/local/deputies-navigate-obstacles-to-put-up-more-security-cameras-in-florence-county-tj-joye-scdot-crime-flock) after running into obstacles with SCDOT permits. Cameras on private land, operating under a county sheriff's authority, feeding into SLED's statewide database.

In Greenville, two sisters were [pulled over at gunpoint](/blog/greenville-flock-contracts) after a Flock camera misread their license plate. Flock's cameras "often misidentify plates or provide incorrect information to officers," per [Business Insider](https://www.businessinsider.com/flock-safety-alpr-cameras-misreads-2024). If the system already misreads plates at unknown error rates, what happens when it starts classifying race? Misidentification plus racial classification equals compounded harm. The patent describes exactly that system.

## 20 billion scans a month

Flock processes 20 billion license plate scans every month across its national network. Over 100,000 cameras in 49 states. The [ACLU reported](https://www.aclu.org/news/national-security/surveillance-company-flock-now-using-ai-to-report-us-to-police-if-it-thinks-our-movement-patterns-are-suspicious) that Flock uses AI to flag drivers whose movement patterns it considers "suspicious" and alerts police automatically. An algorithm decides your driving pattern looks wrong, and the police get a flag. No warrant required. No crime alleged.

Flock's word is already compromised. Their CEO [denied federal contracts on camera](/blog/flock-safetys-track-record), then admitted three weeks later to secretly giving Border Patrol access to local police cameras nationwide. If the company lied about who could search your plates, why would you trust them not to activate what they patented?

In Norfolk, Virginia, a federal judge ruled in February 2025 that extensive Flock camera use "may require warrants under Carpenter v. United States." The case revealed that one Norfolk resident had been tracked [526 times in 4.5 months](https://consumerrights.wiki/w/Flock_license_plate_readers) across 172 cameras. Five hundred twenty-six data points on one person's movements, without a warrant.

South Carolina's SLED database is where these patent capabilities stop being theoretical. [422 million plate reads](https://www.postandcourier.com/news/alpr-cameras-south-carolina-flock-safety-license-plate-readers/article_787a262a-dbd2-11ee-a901-634acead588b.html), stored for 3 years, accessible to 2,000+ users across 99+ law enforcement agencies. The cross-camera tracking infrastructure the patent describes already exists here. The 99+ agencies sharing data means a person can be tracked from one end of the state to the other.

For a full breakdown of why this matters under the 4th Amendment, see our [Carpenter analysis](/blog/the-4th-amendment-loophole).

## What would stop this

Of the 4 ALPR bills pending in the SC legislature, only one addresses what analysis Flock can actually run on your data. [H4675](/blog/h4675-strongest-alpr-bill-in-sc) includes an AI vehicle tracking ban that would prohibit the activation of the patented capabilities described in US11416545B1.

The other 3 bills regulate retention periods and access rules. Those matter, but they don't touch classification. A bill that says "delete plate reads after 90 days" doesn't stop Flock from classifying drivers by race during those 90 days. Only H4675 prohibits it.

Without H4675 or a local ordinance, there is no legal barrier between the patent and your cameras. No federal law covers it. No state law covers it. No contract clause blocks it. The only thing standing between Flock's patented racial classification system and your city's cameras is Flock's word that they won't turn it on.

For the full picture of SC's regulatory vacuum, see [SC Has No License Plate Camera Law](/blog/sc-has-no-license-plate-camera-law). For a step-by-step playbook on what to do about it, see the [action guide](/blog/how-to-fight-alpr-surveillance-sc).

## What you can do

**First, ask your local council.** If your city or county has Flock cameras, these questions deserve answers:

- Did you know your camera vendor patented demographic classification and facial recognition technology? ([Read the patent](https://patents.google.com/patent/US11416545B1/en))
- Has anyone on council read Patent US11416545B1?
- Does your contract allow Flock to push software upgrades without council approval?
- What happens when a company that patents these capabilities also controls the cameras on our roads?

Anyone can ask these questions. Print the patent number. Bring it to a council meeting. Ask them if they've read it. Our [speaking toolkit](/toolkit/speaking) covers how to use your public comment time without getting dismissed.

**Second, support H4675.** It's the only pending bill that would actually prevent Flock from activating these capabilities in South Carolina. Find your state legislators and tell them to support it. Our [H4675 breakdown](/blog/h4675-strongest-alpr-bill-in-sc) has the full details.

<div class="not-prose my-10 border border-[rgba(255,255,255,0.07)] bg-[#1a1a1a] px-8 py-8 text-center">
  <p class="label-mono-heading mb-3">Contact your reps about H4675</p>
  <p class="text-[#a3a3a3] text-sm mb-5">Find your city council, county council, and state legislators.</p>
  <button type="button" data-open-action class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 transition-colors cursor-pointer">Find Your Rep</button>
</div>

<div class="not-prose my-10 border border-[rgba(255,255,255,0.07)] bg-[#161616]">
  <div class="px-8 pt-8 pb-4">
    <p class="label-mono-heading mb-2">Frequently asked questions</p>
  </div>
  <details class="border-t border-[rgba(255,255,255,0.07)] group" open>
    <summary class="px-8 py-5 cursor-pointer text-[#e8e8e8] font-semibold text-base leading-snug list-none flex justify-between items-center hover:bg-[rgba(255,255,255,0.02)] transition-colors [&::-webkit-details-marker]:hidden">
      Does Flock Safety use facial recognition?
      <span class="text-[#737373] text-xl ml-4 shrink-0 group-open:rotate-45 transition-transform">+</span>
    </summary>
    <div class="px-8 pb-6 text-[#a0a0a0] text-[15px] leading-relaxed max-w-[560px]">
      <strong class="text-[#e8e8e8]">Their patent describes it. Their product page denies it.</strong> Patent US11416545B1 describes facial recognition data points as part of the classification system. Their product page says they "do not use facial recognition technology." The patent represents what they built and filed with the US government. The product page represents what they tell customers.
    </div>
  </details>
  <details class="border-t border-[rgba(255,255,255,0.07)] group">
    <summary class="px-8 py-5 cursor-pointer text-[#e8e8e8] font-semibold text-base leading-snug list-none flex justify-between items-center hover:bg-[rgba(255,255,255,0.02)] transition-colors [&::-webkit-details-marker]:hidden">
      Can Flock Safety cameras identify race or gender?
      <span class="text-[#737373] text-xl ml-4 shrink-0 group-open:rotate-45 transition-transform">+</span>
    </summary>
    <div class="px-8 pb-6 text-[#a0a0a0] text-[15px] leading-relaxed max-w-[560px]">
      <strong class="text-[#e8e8e8]">The capabilities are patented.</strong> US11416545B1 explicitly describes classification by race, gender, estimated height, and weight using neural networks. Flock's marketing says they don't identify these characteristics. Whether they're active on any given camera is a software configuration.
    </div>
  </details>
  <details class="border-t border-[rgba(255,255,255,0.07)] group">
    <summary class="px-8 py-5 cursor-pointer text-[#e8e8e8] font-semibold text-base leading-snug list-none flex justify-between items-center hover:bg-[rgba(255,255,255,0.02)] transition-colors [&::-webkit-details-marker]:hidden">
      What does Flock Safety's patent cover?
      <span class="text-[#737373] text-xl ml-4 shrink-0 group-open:rotate-45 transition-transform">+</span>
    </summary>
    <div class="px-8 pb-6 text-[#a0a0a0] text-[15px] leading-relaxed max-w-[560px]">
      US11416545B1 covers object-based queries of video surveillance content, including classification of people by race, gender, height, weight, and clothing, plus cross-camera tracking via statistical similarity. Filed October 2020, granted August 2022, assigned to Flock Group Inc.
    </div>
  </details>
  <details class="border-t border-[rgba(255,255,255,0.07)] group">
    <summary class="px-8 py-5 cursor-pointer text-[#e8e8e8] font-semibold text-base leading-snug list-none flex justify-between items-center hover:bg-[rgba(255,255,255,0.02)] transition-colors [&::-webkit-details-marker]:hidden">
      Can Flock activate new capabilities without city approval?
      <span class="text-[#737373] text-xl ml-4 shrink-0 group-open:rotate-45 transition-transform">+</span>
    </summary>
    <div class="px-8 pb-6 text-[#a0a0a0] text-[15px] leading-relaxed max-w-[560px]">
      <strong class="text-[#e8e8e8]">Greenville's contract says yes.</strong> Section 2.12 allows Flock to make "any upgrades to the system or platform that it deems necessary or useful" without the city's consent, as long as changes don't "materially change any terms or conditions." If your city has a similar contract, Flock can push updates without asking.
    </div>
  </details>
</div>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Does Flock Safety use facial recognition?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Flock Safety's patent US11416545B1 describes facial recognition data points as a core capability. Their product page says they do not use facial recognition technology. The patent represents what they built and filed with the US government."
      }
    },
    {
      "@type": "Question",
      "name": "Can Flock Safety cameras identify race or gender?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Patent US11416545B1 explicitly describes classification by race, gender, estimated height, and weight using neural networks. Flock's marketing says they don't identify these characteristics. The capabilities are patented. Whether they're activated is a software configuration."
      }
    },
    {
      "@type": "Question",
      "name": "What does Flock Safety's patent cover?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "US11416545B1 covers object-based queries of video surveillance content, including classification of people by race, gender, height, weight, and clothing, plus cross-camera person tracking via statistical similarity. Filed October 2020, granted August 2022, assigned to Flock Group Inc."
      }
    },
    {
      "@type": "Question",
      "name": "Can Flock activate new camera capabilities without city approval?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Greenville's Flock contract Section 2.12 allows Flock to make any upgrades to the system it deems necessary or useful without the city's consent, as long as the changes don't materially alter contract terms. Patent-described capabilities like racial classification could be activated through a software update under this clause."
      }
    }
  ]
}
</script>

## Sources

* [Patent US11416545B1: System and method for object based query of video content (Google Patents)](https://patents.google.com/patent/US11416545B1/en)
* [Flock Safety: Are Flock Products Discriminatory? (Feb 2026)](https://www.flocksafety.com/blog/are-flock-products-discriminatory/)
* [Flock Safety: FreeForm Product Page](https://www.flocksafety.com/products/flock-freeform)
* [ACLU: Surveillance Company Flock Using AI to Report Suspicious Movement Patterns (Jul 2025)](https://www.aclu.org/news/national-security/surveillance-company-flock-now-using-ai-to-report-us-to-police-if-it-thinks-our-movement-patterns-are-suspicious)
* [Consumer Rights Wiki: Flock License Plate Readers / Norfolk federal case](https://consumerrights.wiki/w/Flock_license_plate_readers)
* [Business Insider: Flock Safety ALPR camera misreads (2024)](https://www.businessinsider.com/flock-safety-alpr-cameras-misreads-2024)
* [Post and Courier: SC ALPR cameras investigation (Mar 2024)](https://www.postandcourier.com/news/alpr-cameras-south-carolina-flock-safety-license-plate-readers/article_787a262a-dbd2-11ee-a901-634acead588b.html)
* [WPDE: Deputies navigate obstacles to install cameras in Florence County](https://wpde.com/news/local/deputies-navigate-obstacles-to-put-up-more-security-cameras-in-florence-county-tj-joye-scdot-crime-flock)
* [SC Legislature: H. 4675](https://www.scstatehouse.gov/sess126_2025-2026/bills/4675.htm)
