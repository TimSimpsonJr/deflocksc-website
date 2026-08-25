// Structured content for the two council "leave-behind" briefs (city + county).
// Copy is verbatim from scratchpad/council-brief-copy.md (copydesk-passed).
// The city brief is the original Greenville brief, genericized; the county brief
// is a close parallel that changes only what the elected-sheriff argument
// requires, plus a FAQ. Shared fragments live once as consts / small factories;
// only standfirst, authority, model, the county FAQ, the breadcrumb/title/
// description strings, and source row #4 differ between the two.
//
// No em dashes anywhere in rendered output (per design). Section headings and
// the fixed header text (lockup, filed tag, H1) are hardcoded in
// CouncilBrief.astro; everything variable is supplied here.

export interface BriefGround {
  /** Bold lead clause. */
  lead: string;
  /** Remainder of the sentence, rendered in normal weight after the lead. */
  rest: string;
}

export interface BriefCard {
  title: string;
  /** Tabler icon key (see ICONS map in CouncilBrief.astro). */
  icon: string;
  /** Amber section-cite tag (e.g. "Oconee § 2-502", "A city addition"). */
  cite?: string;
  body: string;
  /** Full-width card when true. */
  span?: boolean;
  /** Amber icon treatment (for the audit-logs "city addition" card). */
  accent?: 'amber';
}

export interface BriefSource {
  label: string;
  href: string;
  /** Mono source tag (e.g. "Post & Courier", "SC Statehouse"). */
  tag: string;
}

export interface BriefFaq {
  q: string;
  a: string;
}

export interface CouncilBrief {
  variant: 'city' | 'county';
  /** Breadcrumb + page-title label, e.g. "City Council Brief". */
  breadcrumbLabel: string;
  /** <title> string. */
  pageTitle: string;
  /** Meta description string. */
  pageDescription: string;
  standfirst: string;
  ask: { lede: string; paras: string[] };
  authority: { intro: string; grounds: BriefGround[]; ledeClose: string };
  precedent: {
    intro: string;
    quote: { text: string; attribution: string };
    close: string;
  };
  model: { intro: string; cards: BriefCard[]; note: string };
  /** County only; undefined on the city brief. */
  faq?: { heading: string; items: BriefFaq[] };
  sources: { intro: string; items: BriefSource[] };
  contact: { heading: string; body: string; email: string };
}

// ── Shared fragments ────────────────────────────────────────────────────────

const CONTACT_EMAIL = 'DeflockSC@proton.me';

/** Precedent intro (Oconee 4-1 vote) is identical on both briefs. */
const precedentIntro =
  'Just up the road, Oconee County Council voted 4 to 1 on August 18 to advance an ordinance it calls Protection from Mass Surveillance, using this same home-rule authority. A public hearing and final reading are set for September 15.';

/** The exact Matthew Durham pull quote (shared). */
const durhamQuote = {
  text:
    "We have the Constitution to limit government for a reason. The effectiveness of the tool doesn't outweigh the citizens' right to privacy.",
  attribution: 'Matthew Durham · Oconee County Council Chairman',
};

/** Precedent close differs only in the closing jurisdiction noun. */
function precedentClose(noun: 'city' | 'county'): string {
  return `Right next door, the City of Greer paused its own Flock camera program for 90 days on August 21 to study it before deciding what comes next. And across the country in 2026, communities of every size have let these contracts lapse, switched the cameras off, or taken them down. Oconee and Greer have already moved, and your ${noun} can be next.`;
}

function makePrecedent(noun: 'city' | 'county'): CouncilBrief['precedent'] {
  return { intro: precedentIntro, quote: durhamQuote, close: precedentClose(noun) };
}

/** "The ask" body carries city/county swaps, so it is built per variant. */
function makeAsk(noun: 'city' | 'county'): CouncilBrief['ask'] {
  return {
    lede: `Take up an ordinance that sets sensible, public rules for automated license-plate cameras in your ${noun}.`,
    paras: [
      `These cameras photograph and log the movements of nearly every car that passes them, from the school run to the church parking lot, and right now no local ordinance shapes how that data is collected, kept, or shared. A public system that watches the whole ${noun} should run on public rules.`,
      `The first step is a small one: direct ${noun} staff to draft that ordinance, so the public has a seat at the table as it takes shape.`,
    ],
  };
}

/** Contact block is identical on both briefs. */
const contact: CouncilBrief['contact'] = {
  heading: "Let's talk.",
  body:
    "I'd welcome the chance to sit down with any of you, walk through what other communities have done, and be a resource however I can.",
  email: CONTACT_EMAIL,
};

const sourcesIntro =
  "We've gathered the primary sources so you can verify every claim here.";

/** Source rows 1, 2, 3, and 5 are shared; row 4 (Home Rule) differs by variant. */
const sharedSourceOconeeText: BriefSource = {
  label: "Oconee County's ordinance text (Article VII, Sec. 2-500 to 2-516)",
  href: 'https://oconeesc.com/documents/council/agendas-and-minutes/2026/backup-material/2026-08-18-amended-backup.pdf',
  tag: 'Oconee County · PDF',
};
const sharedSourceVote: BriefSource = {
  label: "Oconee County's 4-1 vote to advance the ordinance",
  href: 'https://www.postandcourier.com/greenville/news/oconee-county-flock-cameras-defund/article_2ea48241-4795-454f-9468-98c887f060c5.html',
  tag: 'Post & Courier',
};
const sharedSourceGreer: BriefSource = {
  label: "Greer's 90-day suspension of its Flock program",
  href: 'https://www.foxcarolina.com/2026/08/21/city-greer-suspending-flock-camera-system-period-time/',
  tag: 'Fox Carolina',
};
const sharedSourceToolkit: BriefSource = {
  label: 'Map the cameras and read our full toolkit',
  href: 'https://deflocksc.org',
  tag: 'DeflockSC.org',
};

/** Home-rule ground #1 (no state law) is identical on both briefs. */
const noStateLawGround: BriefGround = {
  lead: 'There is no state law regulating these cameras',
  rest: ' for a local ordinance to conflict with. The subject is open, and the choice sits with you.',
};

/** Two model cards are byte-identical across the two briefs. */
const defineByCapabilityCard: BriefCard = {
  title: 'Define the problem by capability',
  icon: 'scan',
  cite: 'Oconee § 2-502',
  body: 'It never names Flock. A system is covered when it logs people or vehicles in public and can build a searchable location history, track across places, run facial recognition, or share data to an outside network. A basic hot-list plate check is carved out.',
};
const reportAndEnforceCard: BriefCard = {
  title: 'Report publicly, and enforce it',
  icon: 'clipboard',
  cite: 'Oconee §§ 2-514 to 515',
  body: 'The policy is administered, reported in public once a year, and backed by defined remedies when the rules are broken, so it stays accountable to the people it covers.',
};

// ── City brief ──────────────────────────────────────────────────────────────

export const cityBrief: CouncilBrief = {
  variant: 'city',
  breadcrumbLabel: 'City Council Brief',
  pageTitle:
    'City Council Brief: Public Rules for ALPR Cameras | DeflockSC',
  pageDescription:
    'A printable one-page brief for your city council: the case for local rules on automated license-plate cameras, the Oconee County model ordinance, and the primary sources.',
  standfirst:
    'Your city already runs automated license-plate cameras on its streets. This council has the authority to decide how they are used. Here is the case, and a ready starting point.',
  ask: makeAsk('city'),
  authority: {
    intro:
      "South Carolina's Home Rule Act of 1975, built on Article VIII of the state constitution, moved decisions like this one down to local governments. Section 5-7-30 gives every municipality broad authority to pass ordinances for the health, safety, and good government of the community, including law enforcement, so long as they don't conflict with state law.",
    grounds: [
      noStateLawGround,
      {
        lead: "Your city's cameras are run by the city's own police department,",
        rest: ' which answers to this council. You can set policy on them directly, without waiting on the state legislature or the county.',
      },
    ],
    ledeClose: "The rulebook for these cameras is your city's to write.",
  },
  precedent: makePrecedent('city'),
  model: {
    intro:
      "Oconee's ordinance is a clean template. Its Protection from Mass Surveillance Ordinance (Article VII, Sections 2-500 through 2-516) works in a few moves your city could mirror, with one worth adding on top:",
    cards: [
      defineByCapabilityCard,
      {
        title: 'Keep public money and property out of it',
        icon: 'money-off',
        cite: 'Oconee §§ 2-504 to 506',
        body: 'No public funds, subscriptions, power, or communications may support a covered system, and none of it may sit on public property or road rights-of-way. Your city runs its own cameras, so it can apply this directly.',
      },
      {
        title: 'Set a firm removal timeline',
        icon: 'clock',
        cite: 'Oconee § 2-507',
        body: 'For a system already in place, outside data-sharing and funded connections stop within 10 business days of notice, and the equipment comes down within 30. It turns a pause into a removal on a fixed schedule.',
      },
      reportAndEnforceCard,
      {
        title: 'Publish the audit logs',
        icon: 'file-search',
        accent: 'amber',
        cite: 'A city addition',
        body: 'Post a plain public record of every search on a regular schedule: who ran it, when, and the reason they gave. Audits are what catch misuse, so putting them in the open keeps the system honest without waiting for someone to file a complaint. Because your city runs its own cameras, it can go a step further than Oconee here.',
        span: true,
      },
    ],
    note:
      "Because your city's cameras answer to this council, an ordinance here can be simpler than Oconee's, which had to route around an independently elected sheriff. Your staff and city attorney can shape the language, and we're glad to share ours and what's worked in other cities.",
  },
  faq: undefined,
  sources: {
    intro: sourcesIntro,
    items: [
      sharedSourceOconeeText,
      sharedSourceVote,
      sharedSourceGreer,
      {
        label: 'SC Home Rule: municipal powers, Section 5-7-30',
        href: 'https://www.scstatehouse.gov/code/t05c007.php',
        tag: 'SC Statehouse',
      },
      sharedSourceToolkit,
    ],
  },
  contact,
};

// ── County brief ────────────────────────────────────────────────────────────

export const countyBrief: CouncilBrief = {
  variant: 'county',
  breadcrumbLabel: 'County Council Brief',
  pageTitle:
    'County Council Brief: Public Rules for ALPR Cameras | DeflockSC',
  pageDescription:
    'A printable one-page brief for your county council: how to set local rules on automated license-plate cameras through the county purse and property, the Oconee County model ordinance, and the primary sources.',
  standfirst:
    "Automated license-plate cameras (usually from Flock Safety) already sit on roads in your county, and right now no local rule shapes how they are used. While this council does not directly control the sheriff's office, it controls the county's money, property, and roadsides. Here is the case for removing ALPRs, and a ready starting point.",
  ask: makeAsk('county'),
  authority: {
    intro:
      "South Carolina's Home Rule Act of 1975, built on Article VIII of the state constitution, moved decisions like this one down to local governments, and it gives counties broad authority over their own budgets, property, and roads (Section 4-9-25), so long as they don't conflict with state law. While the sheriff is elected by the county's voters, not hired by this council and you can't tell the sheriff how to run the office, what you DO control is the county's own money and property.",
    grounds: [
      {
        lead: 'There is no state law regulating these cameras',
        rest: ' for a local ordinance to conflict with. The subject is open, and you have the opportunity to lead here.',
      },
      {
        lead: 'Most of these cameras run on county resources:',
        rest: ' county dollars, county power and communications, county buildings, and the county-controlled rights-of-way where the cameras physically sit. Cut those off, and the network can no longer be operated.',
      },
    ],
    ledeClose:
      "You don't have to control the sheriff to decide how the county's money and land get used. That call is yours.",
  },
  precedent: makePrecedent('county'),
  model: {
    intro:
      "Oconee's ordinance is a clean template built for exactly your situation: a county legally operating around an independently elected sheriff. Its Protection from Mass Surveillance Ordinance (Article VII, Sections 2-500 through 2-516) does the work through the levers a county actually holds.",
    cards: [
      defineByCapabilityCard,
      {
        title: 'Keep county money and property out of it',
        icon: 'money-off',
        cite: 'Oconee §§ 2-504 to 506',
        body: 'No county funds, subscriptions, power, or communications may support a covered system, and none of it may sit on county property or road rights-of-way. For a county, this is the heart of the ordinance: the money and the roadsides are yours to withhold.',
      },
      {
        title: 'Close the side doors',
        icon: 'door',
        cite: 'Oconee §§ 2-508 to 510, 2-513',
        body: 'The county can condition its discretionary money to towns, its accommodations-tax funds, and its sponsored events on the same rule, and bar anyone from routing the system through a nonprofit or festival committee to dodge it.',
      },
      {
        title: 'Set a firm removal timeline',
        icon: 'clock',
        cite: 'Oconee § 2-507',
        body: 'For a system already in place, outside data-sharing and county-funded connections stop within 10 business days of notice, and equipment on county property comes down within 30. It turns a pause into a removal on a fixed schedule.',
      },
      { ...reportAndEnforceCard, span: true },
    ],
    note:
      "Because this ordinance works through the county's own money and property, it never tells the sheriff how to do the job (§ 2-501(e) and (f) make that explicit), which keeps it squarely inside this council's authority. Your staff and county attorney can shape the language, and we're glad to share ours and what's worked in other counties.",
  },
  faq: {
    heading: 'Questions your colleagues will ask',
    items: [
      {
        q: 'Why regulate around the sheriff instead of just telling the sheriff to stop?',
        a: "In South Carolina the sheriff is elected by the county's voters, not hired by this council, so this council's authority over the cameras runs through the county's own money and property rather than through orders to the sheriff. It can refuse to spend county dollars on the system, keep it out of county buildings and off the county-controlled roadsides where the cameras sit, and cut discretionary funding to any town that keeps running one. That is a spending and property decision, squarely this council's job, and it leaves the sheriff free to run the office. Oconee's ordinance says as much in plain text: applied to an elected officer, it reaches only county funds, county contracts, and county property, and it never dictates the officer's day-to-day operations.",
      },
      {
        q: 'Why can a city go further, and more directly?',
        a: "A city's police department is part of city government, and the chief answers to the city, so a city council can regulate its own department's cameras head-on: require a documented reason for every search, limit what's kept and shared, mandate audits, or end the program and take the cameras down. A county council gets to the same place through the county's purse and property. Same destination, different road.",
      },
      {
        q: "If we end a Flock contract, can't they just buy a different brand?",
        a: "Not if the ordinance is written by capability instead of by brand. Oconee's covers any system that builds a searchable movement history, tracks across locations, runs facial or device recognition, or shares to an outside network, whatever the vendor's name (§ 2-502), and a plain plate check against a lawful hot list is carved out. End one contract and the rule still stands against the next one.",
      },
    ],
  },
  sources: {
    intro: sourcesIntro,
    items: [
      sharedSourceOconeeText,
      sharedSourceVote,
      sharedSourceGreer,
      {
        label: 'SC Home Rule: county powers, Title 4 (Section 4-9-25)',
        href: 'https://www.scstatehouse.gov/code/t04c009.php',
        tag: 'SC Statehouse',
      },
      sharedSourceToolkit,
    ],
  },
  contact,
};
