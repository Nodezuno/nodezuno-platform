import { legacyPublicAliases } from "./public-navigation.ts";
import { reviewPolicy, reviewPriceLabels, reviewScopeSummary } from "./review-policy.ts";

export type NavItem = {
  title: string;
  description: string;
  href: string;
  badge?: string;
  section?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type PageKind =
  | "product"
  | "solution"
  | "resource"
  | "company"
  | "contact"
  | "legal"
  | "pricing"
  | "status"
  | "directory"
  | "calculator";

export type DetailPageData = {
  path: string;
  eyebrow: string;
  title: string;
  intro: string;
  kind: PageKind;
  accent: "lime" | "aqua" | "violet" | "amber" | "blue";
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  stats?: { value: string; label: string }[];
  capabilities: {
    index: string;
    title: string;
    description: string;
  }[];
  workflow?: {
    label: string;
    title: string;
    description: string;
  }[];
  note?: string;
};

const reviewCta = {
  label: "Start a release review",
  href: "/review/start",
};

const methodologyCta = {
  label: "Read the methodology",
  href: "/methodology",
};

const docsCta = {
  label: "Read the documentation",
  href: "/docs",
};

export const products: NavItem[] = [
  {
    title: "Smart contract and protocol release security review",
    description:
      "Compare a planned release with the version covered by a prior audit or professional security review before production.",
    href: "/product",
    badge: "EVM + non-EVM",
    section: "Service",
  },
  {
    title: "What we review",
    description:
      "See the code, storage, permissions, configuration, integrations, and release payloads included in the review.",
    href: "/product#coverage",
    section: "Service",
  },
  {
    title: "What you receive",
    description:
      "Get a record of the exact release, prioritized findings, reproducible evidence where feasible, and a Proceed, Remediate, or Hold recommendation.",
    href: "/product#deliverables",
    section: "Service",
  },
  {
    title: "Price and scope",
    description:
      `Every supported release review costs ${reviewPriceLabels.total}, whether the target is EVM or non-EVM.`,
    href: "/pricing",
    badge: `${reviewPriceLabels.total} fixed price`,
    section: "Pricing",
  },
];

export const solutions: NavItem[] = [
  {
    title: "How the review works",
    description:
      "Define the release, test the highest-risk changes, verify the evidence, and deliver a reviewer-signed recommendation.",
    href: "/methodology",
    section: "Process",
  },
  {
    title: "Review timeline",
    description:
      "See the five-business-day standard EVM target and how other engagements are scheduled.",
    href: "/methodology#process",
    section: "Process",
  },
  {
    title: "How findings are verified",
    description:
      "See how code, chain state, tests, and human review turn a suspected risk into a documented finding.",
    href: "/methodology#evidence",
    section: "Process",
  },
  {
    title: "What is included",
    description:
      `See how one ${reviewPriceLabels.total} review is bounded for an EVM or non-EVM release.`,
    href: "/pricing#scope",
    section: "Scope",
  },
];

export const communityItems: NavItem[] = [
  {
    title: "How we protect your review",
    description:
      "Read how private code, access, evidence, and retention are handled during an accepted engagement.",
    href: "/security",
    section: "Security",
  },
  {
    title: "AI and human responsibility",
    description:
      "Understand what AI can suggest, what tests must prove, and what the named reviewer must decide.",
    href: "/security#ai-and-human-review",
    section: "Security",
  },
  {
    title: "Responsible disclosure",
    description:
      "How to report a suspected vulnerability in Nodezuno-owned systems without creating additional risk.",
    href: "/security/responsible-disclosure",
    section: "Policies",
  },
  {
    title: "Website and service status",
    description:
      "Check the current website, review intake, private portal, and manual payment-intake status.",
    href: "/status",
    section: "Policies",
  },
];

export const developerItems: NavItem[] = [
  {
    title: "Standard EVM preparation guide",
    description:
      "Use the standard EVM checklist or learn what is needed for a chain-specific non-EVM intake.",
    href: "/docs",
    section: "Guides",
  },
  {
    title: "FAQ",
    description:
      "Direct answers about fit, timing, scope, confidentiality, AI use, pricing, and what the service cannot promise.",
    href: "/faq",
    section: "Guides",
  },
  {
    title: "Technical whitepaper",
    description:
      "Read the current EVM methodology for comparing upgrades, testing against chain state, recording evidence, and assigning human responsibility.",
    href: "/whitepaper",
    badge: "Working paper",
    section: "Technical",
  },
  {
    title: "Research",
    description:
      "Future studies on public upgrade failures, fork testing, financial rules, and measured AI use in security review.",
    href: "/resources/research",
    section: "Technical",
  },
  {
    title: "Nodezuno Signal",
    description:
      "Subscribe to the planned monthly field note for teams shipping onchain changes.",
    href: "/community/newsletter",
    section: "Updates",
  },
];

export const companyItems: NavItem[] = [
  {
    title: "About me",
    description:
      "Meet Sanjay Sudagani and understand the conviction behind Nodezuno.",
    href: "/company/about",
    section: "Nodezuno",
  },
  {
    title: "Contact",
    description:
      "Start a scoped upgrade conversation or send a general company enquiry.",
    href: "/company/contact",
    section: "Nodezuno",
  },
  {
    title: "Careers",
    description:
      "Current hiring status and the security or engineering work Nodezuno may need in the future.",
    href: "/company/careers",
    section: "Updates",
  },
  {
    title: "Newsroom",
    description:
      "Official company, service, and research announcements with dates and supporting links.",
    href: "/company/newsroom",
    section: "Updates",
  },
  {
    title: "Press kit",
    description:
      "Approved descriptions, founder facts, media contacts, and brand assets.",
    href: "/company/press-kit",
    section: "Updates",
  },
  {
    title: "Investor thesis",
    description:
      "The problem, wedge, market logic, and disciplined path behind Nodezuno.",
    href: "/company/investor-thesis",
    section: "Nodezuno",
  },
];

export const navigation: NavGroup[] = [
  {
    label: "Resources",
    items: [
      {
        title: "FAQ",
        description: "Answers about scope, timing, evidence, and payment.",
        href: "/faq",
      },
      {
        title: "EVM Preparation Guide",
        description: "Prepare the files required for a standard EVM review.",
        href: "/docs",
      },
      {
        title: "Technical Whitepaper",
        description: "Read the evidence and human-review method.",
        href: "/whitepaper",
      },
      {
        title: "Security",
        description: "Review data, AI, evidence, and authority controls.",
        href: "/security",
      },
    ],
  },
  {
    label: "Company",
    items: [
      {
        title: "About me",
        description: "Meet Sanjay Sudagani and learn why Nodezuno exists.",
        href: "/company/about",
      },
      {
        title: "Contact",
        description: "Contact Nodezuno without sending sensitive material.",
        href: "/company/contact",
      },
    ],
  },
];

export const footerGroups: NavGroup[] = [
  {
    label: "Service",
    items: [
      { title: "Release Review", description: "", href: "/product" },
      { title: "How It Works", description: "", href: "/methodology" },
      { title: "Pricing", description: "", href: "/pricing" },
      { title: "FAQ", description: "", href: "/faq" },
    ],
  },
  {
    label: "Resources",
    items: [
      { title: "EVM Preparation Guide", description: "", href: "/docs" },
      { title: "Technical Whitepaper", description: "", href: "/whitepaper" },
      { title: "Security", description: "", href: "/security" },
      { title: "Status", description: "", href: "/status" },
    ],
  },
  {
    label: "Company",
    items: [
      { title: "About me", description: "", href: "/company/about" },
      { title: "Contact", description: "", href: "/company/contact" },
      { title: "Press Kit", description: "", href: "/company/press-kit" },
      { title: "Careers", description: "", href: "/company/careers" },
    ],
  },
  {
    label: "Legal",
    items: [
      { title: "Privacy", description: "How Nodezuno handles website and pre-engagement enquiry data.", href: "/legal/privacy" },
      { title: "Terms", description: "Website terms and service boundaries.", href: "/legal/terms" },
      { title: "Acceptable use", description: "Rules for using Nodezuno systems.", href: "/legal/acceptable-use" },
      { title: "Responsible Disclosure", description: "Report a Nodezuno vulnerability safely.", href: "/security/responsible-disclosure" },
    ],
  },
];

const productPages: DetailPageData[] = [
  {
    path: "product",
    eyebrow: "Smart Contract and Protocol Release Review",
    title: "Review the exact release your team plans to deploy.",
    intro:
      "Nodezuno compares one planned release with the version covered by a prior audit or professional security review. We examine changed code, state, permissions, configuration, integrations, and the deployment or governance action, then test the highest-risk behavior and deliver findings, evidence, and a reviewer-signed release recommendation.",
    kind: "product",
    accent: "lime",
    primaryCta: reviewCta,
    secondaryCta: methodologyCta,
    stats: [
      { value: "EVM + NON-EVM", label: "supported ecosystems" },
      { value: `${reviewPriceLabels.total}`, label: "every review" },
      { value: "1 FIX REVIEW", label: "included in scope" },
    ],
    capabilities: [
      {
        index: "01",
        title: "Code and modules",
        description:
          "Changed contracts, programs, modules, dependencies, build settings, and the code that controls the upgrade.",
      },
      {
        index: "02",
        title: "State and migrations",
        description:
          "Storage layouts, account or state changes, initialization, migrations, balances, configuration, and state assumptions.",
      },
      {
        index: "03",
        title: "Permissions and release actions",
        description:
          "Roles, multisigs, timelocks, validators, upgrade authority, governance payloads, and other privileged actions.",
      },
      {
        index: "04",
        title: "Integrations and protocol behavior",
        description:
          "Oracles, bridges, tokens, external calls, accounting rules, consensus-sensitive behavior, and critical protocol guarantees.",
      },
    ],
    workflow: [
      {
        label: "Release record",
        title: "Know exactly what was reviewed",
        description:
          "The reviewed version, new release, network, scope, and deployment or governance action are recorded clearly.",
      },
      {
        label: "Findings",
        title: "Understand each material risk",
        description:
          "Prioritized issues explain the affected behavior, evidence, impact, severity, and practical remediation.",
      },
      {
        label: "Evidence",
        title: "Reproduce important results",
        description:
          "Tests, traces, state changes, reproduction steps, and limitations are included where feasible.",
      },
      {
        label: "Recommendation",
        title: "Decide whether to proceed",
        description:
          "A human reviewer issues Proceed, Remediate, or Hold for the exact release reviewed.",
      },
    ],
    note:
      `The standard package covers one release on one network, with opening intake ceilings of ${reviewPolicy.affectedComponents.max} affected contracts, programs, or modules and ${reviewPolicy.materiallyChangedLines.max} materially changed protocol code lines. Every supported EVM or non-EVM review costs ${reviewPriceLabels.total}. Additional networks or releases require a separate order. The service supplements the prior review and cannot guarantee that every vulnerability will be found.`,
  },
  {
    path: "product/coverage",
    eyebrow: "Review coverage",
    title: "What we test in a smart contract or protocol release.",
    intro:
      "We focus on the parts of a release that can change security, financial, or protocol behavior. The written scope names the exact code, affected contracts or modules, target network, execution actions, state reference, and evidence environment included in the review.",
    kind: "product",
    accent: "aqua",
    primaryCta: reviewCta,
    secondaryCta: { label: "See scope boundaries", href: "/pricing#scope" },
    capabilities: [
      {
        index: "01",
        title: "Build and release",
        description:
          "Check whether the intended source, compiler or toolchain settings, dependencies, artifacts, identifiers, migrations, and release order match.",
      },
      {
        index: "02",
        title: "State and upgrade safety",
        description:
          "Look for incompatible state layouts, unsafe migrations, broken initialization, incorrect upgrade configuration, and unauthorized release paths.",
      },
      {
        index: "03",
        title: "Admin, governance, and integrations",
        description:
          "Trace changes to roles, multisigs, timelocks, validators, minting, pausing, oracles, bridges, tokens, adapters, hooks, and external calls.",
      },
      {
        index: "04",
        title: "Protocol, accounting, and consensus rules",
        description:
          "Test the agreed rules for solvency, balances, pricing, liquidations, withdrawals, permissions, consensus-sensitive behavior, and valid state changes.",
      },
    ],
    workflow: [
      {
        label: "Included",
        title: "The exact release named in the service order",
        description:
          "The statement of work identifies the baseline and candidate revisions, affected contracts or modules, deployed identifiers, execution actions, chain, and reference state included in the review.",
      },
      {
        label: "Conditional",
        title: "External systems affected by the change",
        description:
          "External systems are reviewed only to the depth needed to assess the changed assumptions and only when their interfaces and current state are available.",
      },
      {
        label: "Excluded",
        title: "Work not listed in the service order",
        description:
          "Unchanged code, frontend systems, private infrastructure, governance behavior after delivery, key compromise, and undisclosed dependencies are outside scope unless added in writing.",
      },
    ],
    note:
      `Coverage is adapted to the target ecosystem. EVM and non-EVM reviews use the same ${reviewPriceLabels.total} price and evidence-first principles, but their tools, threat models, limits, and schedules can differ. If the code, execution actions, dependencies, or release plan changes after the service order is created, the work must return to the recorded boundary or move to another review.`,
  },
  {
    path: "product/deliverables",
    eyebrow: "Engagement deliverables",
    title: "What you receive after the release review.",
    intro:
      "Your team receives four concrete deliverables: a record of the exact smart contract or protocol release reviewed, prioritized security findings, reproduction steps where feasible, and a Proceed, Remediate, or Hold recommendation. Every conclusion is tied to named code, state, and evidence.",
    kind: "product",
    accent: "violet",
    primaryCta: reviewCta,
    secondaryCta: { label: "Review the evidence standard", href: "/methodology#evidence" },
    capabilities: [
      {
        index: "01",
        title: "Exact review record",
        description:
          "A dated inventory of baseline and candidate revisions, build settings, included contracts or modules, deployed identifiers, release actions, target chain, reference state, assumptions, exclusions, and artifact hashes.",
      },
      {
        index: "02",
        title: "Prioritized findings",
        description:
          "Each accepted finding records severity, affected code or configuration, preconditions, impact, evidence, recommended correction, customer response, and final remediation state.",
      },
      {
        index: "03",
        title: "Tests and reproduction steps",
        description:
          "Where safe and technically possible, serious findings include a minimal test, invariant failure, transaction sequence, state delta, or fork trace with execution instructions.",
      },
      {
        index: "04",
        title: "Proceed, Remediate, or Hold",
        description:
          "Proceed means no release-blocking issue was identified within scope. Remediate means agreed changes require verification. Hold means unresolved evidence indicates unacceptable release risk.",
      },
    ],
    workflow: [
      {
        label: "Draft",
        title: "Review the findings privately",
        description:
          "The customer receives findings privately, can challenge assumptions, and provides context or proposed fixes through an agreed secure channel.",
      },
      {
        label: "Fix",
        title: "Submit one agreed fix set",
        description:
          "Nodezuno reviews one in-scope fix set and updates each finding only when the corrected code, files, and evidence support the change.",
      },
      {
        label: "Final",
        title: "Receive the final report",
        description:
          "The final package identifies what was reviewed, what changed, what remains unresolved, and the limits of the recommendation at delivery time.",
      },
    ],
    note:
      "The report applies only to the code, release plan, chain state, assumptions, and scope it names. Later changes can invalidate the recommendation.",
  },
];

const methodologyPages: DetailPageData[] = [
  {
    path: "methodology",
    eyebrow: "Review methodology",
    title: "One evidence-first process, adapted to the target chain.",
    intro:
      "Every review starts with the exact release and its audited or agreed baseline recorded in the service order. We then compare behavior, permissions, state, dependencies, and execution steps before testing the riskiest changes in a reproducible environment. Standard EVM reviews use the published EVM method. Non-EVM reviews use a chain-specific method. AI can suggest test ideas, but only evidence and human review support the final recommendation.",
    kind: "solution",
    accent: "blue",
    primaryCta: reviewCta,
    secondaryCta: docsCta,
    stats: [
      { value: "01", label: "define the release" },
      { value: "02", label: "challenge the change" },
      { value: "03", label: "verify the recommendation" },
    ],
    capabilities: [
      {
        index: "01",
        title: "Establish the starting point",
        description:
          "Confirm the prior audit or agreed baseline, deployed code, known findings, accepted risks, configuration, authority controls, and current chain state.",
      },
      {
        index: "02",
        title: "Compare behavior, not just code lines",
        description:
          "Identify changes to state, permissions, initialization or migration, integrations, governance actions, release order, and expected protocol behavior.",
      },
      {
        index: "03",
        title: "Search for realistic failure paths",
        description:
          "Build a prioritized list of ways the upgrade could break access control, accounting, pricing, solvency, availability, or settlement.",
      },
      {
        index: "04",
        title: "Verify every accepted finding",
        description:
          "Use code review, ecosystem-specific tools, local tests, fork or snapshot execution where available, protocol rule checks, and traces before a human reviewer accepts an issue.",
      },
    ],
    workflow: [
      {
        label: "Scope",
        title: "Agree the exact release and inputs",
        description:
          "Agree the code and files to review, scope limits, required access, delivery target, customer contacts, secure communication, and the changes that require a new quote.",
      },
      {
        label: "Review",
        title: "Compare and test the release",
        description:
          "Run independent analysis in an isolated environment, preserve evidence, discuss ambiguous behavior with engineers, and report serious issues privately.",
      },
      {
        label: "Report",
        title: "Verify fixes and issue the recommendation",
        description:
          "Verify one agreed remediation set, record residual risks, and tie the final recommendation to exact hashes and assumptions.",
      },
    ],
    note:
      `The public whitepaper and preparation guide describe the standard EVM method. Non-EVM reviews use chain-specific preparation, tools, test environments, and schedules. Every supported review keeps the same ${reviewPriceLabels.total} price and 50/50 payment structure. Nodezuno's method is not a certification or formal industry standard.`,
  },
  {
    path: "how-it-works/engagement",
    eyebrow: "Engagement process",
    title: "From direct checkout to final report.",
    intro:
      "For the standard EVM package, we target five business days after Sanjay manually checks the scheduling payment and all required files and access are ready. Each non-EVM review receives a chain-specific completion estimate at kickoff. Missing or changing inputs can pause any review and require an updated schedule.",
    kind: "solution",
    accent: "lime",
    primaryCta: reviewCta,
    secondaryCta: { label: "Open the preparation checklist", href: "/docs" },
    capabilities: [
      {
        index: "01",
        title: "Submit one bounded release",
        description:
          `The form captures one supported ecosystem and network, one reviewed baseline, and one planned release. ${reviewScopeSummary}`,
      },
      {
        index: "02",
        title: "Accept the generated service order",
        description:
          "The private checkout immediately records the submitted release boundary, target network, exclusions, fixed price, payment milestones, terms version, and reviewer.",
      },
      {
        index: "03",
        title: "Review the upgrade privately",
        description:
          "We inspect and test the agreed code and release files in an isolated workspace and report serious issues through the approved private channel.",
      },
      {
        index: "04",
        title: "Verify fixes and deliver the report",
        description:
          "We review one agreed fix set, record the final code and files, and issue the findings and recommendation.",
      },
    ],
    workflow: [
      {
        label: "Before review",
        title: "Complete the checklist and scheduling payment",
        description:
          "The customer completes the checklist, provides reproducible builds and a technical owner, signs the agreement, and pays the scheduling deposit.",
      },
      {
        label: "During review",
        title: "Keep one engineer available for questions",
        description:
          "Nodezuno performs analysis and maintains direct access to the customer engineering contact for time-sensitive clarification.",
      },
      {
        label: "After findings",
        title: "Submit one stable fix set",
        description:
          "The customer submits one stable fix set. Additional redesigns, new features, or changed payloads are estimated separately.",
      },
    ],
    note:
      "Five business days is a target only for the standard EVM package, not a guarantee. Non-EVM reviews follow the completion estimate confirmed at kickoff. A larger change, missing files, or major redesign can pause work or require another bounded service order.",
  },
  {
    path: "how-it-works/evidence",
    eyebrow: "Evidence standard",
    title: "Every serious finding must be backed by evidence.",
    intro:
      "AI output is never treated as a finding by itself. Nodezuno accepts an issue only when code, chain state, a reproducible test, an execution trace, or authoritative documentation supports it, and the named reviewer validates the conclusion.",
    kind: "solution",
    accent: "aqua",
    primaryCta: reviewCta,
    secondaryCta: { label: "See the trust model", href: "/security#ai-and-human-review" },
    capabilities: [
      {
        index: "01",
        title: "Identify the exact code and release details",
        description:
          "Every material statement identifies the relevant revisions, source files, build settings, contracts or modules, deployed artifacts, release actions, chain reference, tool versions, and evidence timestamps.",
      },
      {
        index: "02",
        title: "Show reproducible behavior",
        description:
          "Where feasible, a finding includes a minimal test, invariant failure, call sequence, state transition, trace, or build mismatch that an engineer can reproduce in the declared environment.",
      },
      {
        index: "03",
        title: "Explain the risk and confidence",
        description:
          "The report distinguishes observed facts from inferred impact, names exploit prerequisites, explains confidence, and records evidence that conflicts with the conclusion.",
      },
      {
        index: "04",
        title: "Require human validation",
        description:
          "The reviewer identified in the accepted service order checks serious findings, severity, recommended action, and the final release recommendation. Model output cannot approve a release.",
      },
    ],
    workflow: [
      {
        label: "Question",
        title: "Identify a risk to test",
        description:
          "A hypothesis may come from an analyst, a model, a tool, prior research, or customer context. It is not yet a finding.",
      },
      {
        label: "Proof",
        title: "Test it against code and state",
        description:
          "Execution, code, state, or documentation supports or rejects the hypothesis under named conditions and preserved versions.",
      },
      {
        label: "Finding",
        title: "A human reviewer accepts or rejects it",
        description:
          "A human reviewer validates the evidence, explains the impact and uncertainty, and records the issue as a finding.",
      },
    ],
    note:
      "Not every issue can be reduced to a complete exploit. When evidence is incomplete, the report must state the uncertainty and cannot present model confidence as proof.",
  },
  {
    path: "how-it-works/scope",
    eyebrow: "Scope and boundaries",
    title: "One fixed price, with a chain-specific review boundary.",
    intro:
      `Every supported review costs ${reviewPriceLabels.total}. ${reviewScopeSummary} EVM reviews include one deployment or governance payload. Non-EVM reviews apply the same size limits to the target chain's programs, modules, or runtime code.`,
    kind: "solution",
    accent: "amber",
    primaryCta: reviewCta,
    secondaryCta: { label: "Read pricing", href: "/pricing" },
    capabilities: [
      {
        index: "01",
        title: "Standard EVM package",
        description:
          "A qualifying EVM protocol with deployed contracts, a prior professional audit, reproducible builds, a named engineering owner, and a stable material upgrade planned within approximately 30 days.",
      },
      {
        index: "02",
        title: "Non-EVM review",
        description:
          `Choose Solana or SVM programs, Cosmos SDK or CosmWasm modules, Move packages on Sui or Aptos, Substrate runtimes, Starknet releases, or another supported system in the order form. The same bounded-scope limits and ${reviewPriceLabels.total} price apply, and you can continue directly to checkout.`,
      },
      {
        index: "03",
        title: "What your team provides",
        description:
          "Provide complete code and release files, disclose known issues and dependencies, explain expected behavior, answer questions promptly, protect communication channels, and keep control of every deployment decision and credential.",
      },
      {
        index: "04",
        title: "Not included",
        description:
          "A full codebase audit, formal verification proof, frontend or infrastructure penetration test, live key access, deployment authority, insurance, certification, or guarantee against undiscovered vulnerabilities.",
      },
    ],
    workflow: [
      {
        label: "Accept",
        title: "The release is stable and ready to review",
        description:
          "All required code and release files are available, the change is within limits, and the customer can reproduce the baseline and candidate builds.",
      },
      {
        label: "Rescope",
        title: "The change is larger than described",
        description:
          "New contracts, significant dependency changes, missing source, non-reproducible builds, or a redesigned payload require a revised estimate and schedule.",
      },
      {
        label: "Decline",
        title: "We cannot review it responsibly",
        description:
          "Nodezuno should decline work that lacks an auditable baseline, exceeds available expertise, requires custody or unsafe access, or cannot be assessed responsibly within the proposed window.",
      },
    ],
    note:
      `A larger or unaudited system may need a full audit or broader engagement from an appropriately qualified provider. Nodezuno will not compress a complex release into one unsuitable review. Work that exceeds one bounded engagement must be divided into separately accepted ${reviewPriceLabels.total} reviews or declined before payment. The five-day target remains specific to the standard EVM scope.`,
  },
];

const securityPages: DetailPageData[] = [
  {
    path: "security",
    eyebrow: "Security at Nodezuno",
    title: "Required safeguards for review data and customer release control.",
    intro:
      "Every accepted service order must state how customer files are transferred, who may access them, whether third-party AI is allowed, and how long the files are retained. Nodezuno never requests signing keys or authority to deploy customer contracts.",
    kind: "company",
    accent: "aqua",
    primaryCta: { label: "Read the trust model", href: "/security#ai-and-human-review" },
    secondaryCta: {
      label: "Report a vulnerability",
      href: "/security/responsible-disclosure",
    },
    capabilities: [
      {
        index: "01",
        title: "We never need your keys",
        description:
          "Nodezuno does not need private keys, seed phrases, signing authority, production shell access, or deployment control to perform the proposed review. Customers remain the sole release authority.",
      },
      {
        index: "02",
        title: "Separate each customer review",
        description:
          "Before accepting an engagement, Nodezuno requires customer code and files to be separated by engagement, encrypted in transit and at rest, limited to named reviewers, logged, retained for an agreed period, and deleted through a documented closeout process.",
      },
      {
        index: "03",
        title: "Require approval before using external AI",
        description:
          "Private customer code must not be sent to a third-party model unless the customer explicitly approves the provider, terms, retention setting, data path, and purpose in writing.",
      },
      {
        index: "04",
        title: "Tie the report to the exact release",
        description:
          "Reports identify tool versions, code and file hashes, reviewers, material assumptions, unresolved findings, and changes made during remediation so the conclusion cannot silently drift.",
      },
    ],
    workflow: [
      {
        label: "Before intake",
        title: "Minimize what is collected",
        description:
          "Agree approved transfer channels, named users, data classification, AI restrictions, retention, deletion, and incident contacts before private code or files arrive.",
      },
      {
        label: "During review",
        title: "Limit and record access",
        description:
          "Use least privilege, isolated workspaces, protected secrets, dependency pinning, evidence provenance, and private disclosure for serious findings.",
      },
      {
        label: "At closeout",
        title: "Return, retain, or delete deliberately",
        description:
          "Deliver the agreed files, record customer acceptance, remove temporary credentials, and apply the contractual retention or deletion schedule.",
      },
    ],
    note:
      "These are prelaunch security requirements. Nodezuno does not claim SOC 2, ISO 27001, an independent penetration test, cyber insurance, or another external control attestation.",
  },
  {
    path: "security/trust",
    eyebrow: "AI and human responsibility",
    title: "What AI does, what the reviewer decides, and what stays with your team.",
    intro:
      "AI may help identify changes and suggest tests. Reproducible evidence must support material findings. The named reviewer signs the recommendation, while your team keeps full authority over governance, deployment, monitoring, and rollback.",
    kind: "company",
    accent: "violet",
    primaryCta: { label: "Review the evidence standard", href: "/methodology#evidence" },
    secondaryCta: { label: "Read security", href: "/security" },
    capabilities: [
      {
        index: "01",
        title: "AI assists the review",
        description:
          "AI may summarize diffs, propose threat hypotheses, suggest invariants, or explain traces. Its output is untrusted until checked against code, state, execution, and professional judgment.",
      },
      {
        index: "02",
        title: "Reviewer validates findings",
        description:
          "A reviewer can miss issues and must work inside the stated scope. Review identity, relevant experience, conflicts, evidence, and sign-off state should be visible in the final package.",
      },
      {
        index: "03",
        title: "Your team decides whether to deploy",
        description:
          "The customer is responsible for complete inputs, business intent, dependency disclosure, key security, governance, remediation, deployment, monitoring, and the final decision to release.",
      },
      {
        index: "04",
        title: "The recommendation covers one exact release",
        description:
          "The recommendation applies at delivery time to the exact code and file hashes and the declared onchain state. Later changes, governance actions, market conditions, integrations, and newly discovered techniques can alter risk.",
      },
    ],
    workflow: [
      {
        label: "Suggest",
        title: "AI or an analyst proposes a risk",
        description:
          "AI and analysis tools generate leads, show relationships, and run repeatable checks without receiving authority over customer systems.",
      },
      {
        label: "Test",
        title: "Code and tools check the claim",
        description:
          "A suspected issue becomes an accepted finding only when the relevant code, state, execution, or authoritative specification supports it under stated conditions.",
      },
      {
        label: "Approve",
        title: "A human signs the conclusion",
        description:
          "The reviewer identified in the accepted service order signs the report, while the customer retains governance, deployment, incident response, and release authority.",
      },
    ],
    note:
      "The review reduces uncertainty within a fixed scope. It is not an autonomous audit, a guarantee, or a transfer of protocol responsibility.",
  },
  {
    path: "security/responsible-disclosure",
    eyebrow: "Responsible disclosure",
    title: "Report a Nodezuno vulnerability safely.",
    intro:
      "This policy covers suspected vulnerabilities in systems and repositories owned and operated by Nodezuno. It does not authorize testing against customer protocols, customer infrastructure, third-party services, or public blockchains.",
    kind: "contact",
    accent: "amber",
    primaryCta: { label: "Email info@nodezuno.com", href: "mailto:info@nodezuno.com" },
    secondaryCta: { label: "Read the security model", href: "/security" },
    capabilities: [
      {
        index: "01",
        title: "Send a minimal report",
        description:
          "Include the affected Nodezuno-owned asset, vulnerability category, likely impact, minimal non-destructive reproduction steps, timestamps, and a safe way to contact you. Do not send secrets in the first message.",
      },
      {
        index: "02",
        title: "Avoid harmful activity",
        description:
          "Do not access other users' data, persist access, modify or delete data, use social engineering, degrade availability, exfiltrate private material, or continue after obtaining minimal proof.",
      },
      {
        index: "03",
        title: "Protect customer systems",
        description:
          "Customer contracts and infrastructure are out of scope unless that customer has separately published an applicable authorization and safe-harbor policy. Nodezuno cannot grant permission on a customer's behalf.",
      },
      {
        index: "04",
        title: "Coordinate publication",
        description:
          "Give Nodezuno a reasonable opportunity to investigate and correct an accepted issue before public disclosure. We will communicate scope, status, and a proposed disclosure timeline when a valid report is confirmed.",
      },
    ],
    workflow: [
      {
        label: "Receive",
        title: "Acknowledge and protect the channel",
        description:
          "Nodezuno will confirm receipt when operationally possible and arrange a restricted evidence channel if sensitive details are required.",
      },
      {
        label: "Triage",
        title: "Validate ownership and impact",
        description:
          "The team will determine whether the asset is in scope, reproduce the issue safely, assess severity, and request only the evidence needed for investigation.",
      },
      {
        label: "Resolve",
        title: "Remediate and coordinate",
        description:
          "Accepted issues move through correction, validation, affected-party communication, and coordinated publication as appropriate.",
      },
    ],
    note:
      "No public reward or legal safe harbor is currently offered. A submission does not create a right to payment or authorize unlawful, disruptive, or out-of-scope testing.",
  },
];

const resourcePages: DetailPageData[] = [
  {
    path: "docs",
    eyebrow: "Standard EVM Preparation Guide",
    title: "Prepare for a standard EVM upgrade review.",
    intro:
      "For the published EVM package, prepare a stable upgrade candidate, the prior audit, build instructions, deployed addresses, proposed deployment or governance transaction, expected behavior, and responsible contacts. The five-business-day target starts only when these materials are complete.",
    kind: "resource",
    accent: "blue",
    primaryCta: reviewCta,
    secondaryCta: { label: "Check the scope", href: "/pricing#scope" },
    capabilities: [
      {
        index: "01",
        title: "Code and build files",
        description:
          "Prepare baseline and candidate commits, prior audit reports, build commands, compiler settings, dependency locks, addresses, ABIs, storage layouts, proxy topology, proposed calldata, deployment scripts, tests, specifications, and known issues.",
      },
      {
        index: "02",
        title: "Onchain system details",
        description:
          "Name the chain ID, fork block, deployed contracts, role holders, multisigs, timelocks, oracles, tokens, adapters, bridges, trusted actors, external services, and relevant configuration values.",
      },
      {
        index: "03",
        title: "Expected behavior and rollout plan",
        description:
          "Describe the business reason for the upgrade, intended state transitions, values that must never occur, expected migrations, rollout order, monitoring plan, pause conditions, and rollback options.",
      },
      {
        index: "04",
        title: "Contacts and secure sharing",
        description:
          "Assign a technical owner and decision owner, agree transfer and disclosure channels, specify model-use restrictions, and never provide private keys, seed phrases, or unnecessary production access.",
      },
    ],
    workflow: [
      {
        label: "Submit",
        title: "Provide a stable candidate",
        description:
          "Share a reproducible release candidate and complete the scope checklist. The review clock does not begin while required code or release files are missing or changing.",
      },
      {
        label: "Respond",
        title: "Keep one engineering contact available",
        description:
          "Resolve intent and environment questions promptly, acknowledge serious findings, and avoid changing the candidate without notifying the reviewer.",
      },
      {
        label: "Close",
        title: "Freeze final hashes",
        description:
          "Submit one agreed remediation set, reproduce the final build, confirm delivery, and retain the report with the exact deployment record.",
      },
    ],
    note:
      "This checklist supports the standard EVM methodology. Non-EVM orders receive ecosystem-specific preparation requirements at kickoff. Nodezuno does not currently offer a public review scanner or review API.",
  },
  {
    path: "faq",
    eyebrow: "Frequently asked questions",
    title: "Common questions about smart contract and protocol release reviews.",
    intro:
      "Practical answers about fit, scope, timing, price, AI use, privacy, and the limits of the service.",
    kind: "resource",
    accent: "lime",
    primaryCta: reviewCta,
    secondaryCta: docsCta,
    capabilities: [
      {
        index: "01",
        title: "Is this a full audit?",
        description:
          "No. Nodezuno reviews one defined upgrade, not the entire codebase. EVM and non-EVM service orders must identify an already-audited or reviewed baseline and one bounded release. New or unaudited systems may need a full audit from another qualified provider.",
      },
      {
        index: "02",
        title: "Does Nodezuno guarantee that an upgrade is safe?",
        description:
          "No. The review reduces uncertainty within the agreed scope, but no security review can prove that every vulnerability is absent or prevent future governance mistakes, market failures, key compromise, or undisclosed dependencies.",
      },
      {
        index: "03",
        title: "Does AI decide the result?",
        description:
          "No. AI helps explain changes and suggest risks to test. The reviewer named in the accepted service order validates findings and signs the final recommendation.",
      },
      {
        index: "04",
        title: "What does a review cost?",
        description:
          `Every supported EVM or non-EVM review costs ${reviewPriceLabels.total}. You pay a ${reviewPriceLabels.deposit} scheduling deposit after accepting the generated service order, then the remaining ${reviewPriceLabels.balance} before the final report. Payment uses the exact USDC or USDT amount shown in the private portal on Ethereum Mainnet. Taxes are separate. Work outside one bounded review requires another ${reviewPriceLabels.total} service order.`,
      },
    ],
    workflow: [
      {
        label: "Timing",
        title: "Can the standard EVM review finish in five business days?",
        description:
          "Five business days is the target after a standard EVM review is ready to begin, not a guarantee. Non-EVM reviews receive a chain-specific completion estimate at kickoff. Missing files, changing code, unusual architecture, major findings, or reviewer availability can change timing.",
      },
      {
        label: "Privacy",
        title: "Will private code be sent to an AI provider?",
        description:
          "Not without your written approval of the provider, purpose, data path, terms, and retention settings. The service order can restrict analysis to approved local and reproducible tools.",
      },
      {
        label: "Fit",
        title: "Who should request a review?",
        description:
          "A team planning a material smart contract or protocol release within about 30 days. A valid bounded form creates the order for any listed EVM or non-EVM category. Chain-specific preparation and timing are confirmed at kickoff.",
      },
    ],
    note:
      "Questions about an exact system are answered during the initial scope review. A conversation, estimate, or review report is not legal, financial, insurance, or investment advice.",
  },
  {
    path: "whitepaper",
    eyebrow: "Standard EVM Technical Whitepaper, Working Paper",
    title: "The standard EVM method for reviewing upgrades before deployment.",
    intro:
      "This working paper describes Nodezuno's standard EVM method: define one exact release, compare it with the audited version, test important risks against pinned fork state, record reproducible evidence, and keep the final recommendation under human responsibility.",
    kind: "resource",
    accent: "violet",
    primaryCta: methodologyCta,
    secondaryCta: reviewCta,
    capabilities: [
      {
        index: "01",
        title: "Release manifest",
        description:
          "A content-addressed record binds intent, source, build settings, bytecode, deployed state, governance payloads, dependencies, owners, scope, and approved evidence to one release candidate.",
      },
      {
        index: "02",
        title: "Assurance graph",
        description:
          "Claims connect to assumptions, artifacts, hypotheses, tests, traces, findings, reviewer decisions, remediation commits, and the final deployed transaction without hiding provenance.",
      },
      {
        index: "03",
        title: "Execution layer",
        description:
          "Isolated builds, static tools, local test suites, pinned forks, invariant runners, and trace analyzers produce reproducible results under versioned environments.",
      },
      {
        index: "04",
        title: "Policy and authority",
        description:
          "Organizations define required checks, severity gates, accepted exceptions, reviewer roles, artifact freshness, approval thresholds, and deployment integrations while retaining final authority.",
      },
    ],
    workflow: [
      {
        label: "Service",
        title: "Learn through focused reviews",
        description:
          "Early engagements establish recurring buyer problems, evidence schemas, invariant libraries, delivery economics, and the limits of automation.",
      },
      {
        label: "Workflow",
        title: "Automate repeatable checks",
        description:
          "Customer-specific baselines and policies move stable analysis into pull-request, testnet, and governance proposal workflows with human escalation.",
      },
      {
        label: "Control plane",
        title: "Connect evidence to release authority",
        description:
          "A future private runner and approval layer can make verified evidence a required input to institutional onchain change management.",
      },
    ],
    note:
      "This paper covers the standard EVM methodology only. It is not a universal method for non-EVM ecosystems, a peer-reviewed paper, or a description of a generally available platform. Architecture, commercial terms, and security claims require validation through released software and customer evidence.",
  },
  {
    path: "resources/research",
    eyebrow: "Nodezuno research",
    title: "Research on how smart contract and protocol releases fail and how to test them.",
    intro:
      "Nodezuno research will cover upgrade failures across EVM and non-EVM ecosystems, financial and protocol rules, reproducible chain testing, and measured AI use in security review. No public study has been released yet.",
    kind: "resource",
    accent: "amber",
    primaryCta: { label: "Read the working paper", href: "/whitepaper" },
    secondaryCta: { label: "Contact Nodezuno", href: "/company/contact" },
    capabilities: [
      {
        index: "01",
        title: "Exploit reproductions",
        description:
          "Recreate selected public incidents in safe local or forked environments, pin all dependencies and state, and show which release checks could have surfaced the failure.",
      },
      {
        index: "02",
        title: "Invariant studies",
        description:
          "Explain how business guarantees become executable properties, where properties can mislead, and how state selection affects economic security conclusions.",
      },
      {
        index: "03",
        title: "AI evaluation",
        description:
          "Measure useful hypotheses, unsupported claims, missed issues, reviewer time, reproducibility, and data-handling constraints rather than presenting model fluency as security performance.",
      },
      {
        index: "04",
        title: "Versioned corrections",
        description:
          "Publish authorship, dates, source references, repositories where possible, assumptions, limitations, and a visible correction history for material changes.",
      },
    ],
    note:
      "No public Nodezuno research studies have been released yet. The first publication should be a reproducible historical exploit study, not a promotional announcement.",
  },
  {
    path: "community/newsletter",
    eyebrow: "Nodezuno Signal",
    title: "One careful field note for teams shipping onchain changes.",
    intro:
      "Nodezuno Signal is a planned monthly briefing about smart contract and protocol release risk, reproducible evidence, and lessons from public incidents. Subscribe with your email, then use the confirmation link we send before delivery begins.",
    kind: "resource",
    accent: "violet",
    primaryCta: { label: "Subscribe", href: "#newsletter-form" },
    secondaryCta: { label: "Read the privacy notice", href: "/legal/privacy" },
    capabilities: [
      {
        index: "01",
        title: "Release evidence",
        description:
          "Practical notes on baselines, storage and authority changes, governance payloads, fork testing, invariants, and reproducible findings.",
      },
      {
        index: "02",
        title: "Public incident lessons",
        description:
          "Careful breakdowns of disclosed protocol failures, with sources, limitations, and corrections instead of invented certainty.",
      },
      {
        index: "03",
        title: "Confirmed permission",
        description:
          "Your signup remains pending until you confirm it through the email we send. Automated link scanners do not complete confirmation, and every message includes an unsubscribe link.",
      },
      {
        index: "04",
        title: "No list resale",
        description:
          "Subscription data is used for Nodezuno Signal and its delivery operations. It is not sold as a contact list.",
      },
    ],
    note:
      "No issue has been published yet. Confirming a subscription records permission for future Nodezuno Signal email and does not create a customer relationship or review engagement.",
  },
  {
    path: "status",
    eyebrow: "Nodezuno status",
    title: "Nodezuno service status.",
    intro:
      "This page summarizes the maturity of the public website, review request form, private review portal, and manual Ethereum Mainnet payment intake. Automatic payment verification is off in the Cloudflare Free deployment. Security reviews are scheduled individually, and automated continuous review software is not yet available.",
    kind: "status",
    accent: "aqua",
    primaryCta: { label: "Read product maturity", href: "/product" },
    secondaryCta: { label: "Contact support", href: "/company/contact" },
    stats: [
      { value: "OPERATIONAL", label: "website and intake" },
      { value: "CASE BY CASE", label: "fixed-scope reviews" },
      { value: "PLANNED", label: "continuous review software" },
    ],
    capabilities: [
      {
        index: "01",
        title: "Public website",
        description:
          "Product, methodology, pricing, company, security, and legal information can be published and monitored independently from any future customer analysis environment.",
      },
      {
        index: "02",
        title: "Opening service",
        description:
          "Review requests may be accepted, but scheduling depends on scope readiness, reviewer availability, signed terms, payment, and a safe engagement environment.",
      },
      {
        index: "03",
        title: "Continuous review software",
        description:
          "Continuous integration checks, governance monitoring, and a customer analysis workspace remain future plans until they are implemented and verified.",
      },
      {
        index: "04",
        title: "Incident history",
        description:
          "Dated incidents will appear here for services Nodezuno operates. Historical uptime will be published only after enough production data exists.",
      },
    ],
    note:
      "Status labels are maturity statements, not availability guarantees. Contractual availability, support, recovery, and notification commitments exist only when included in a signed customer agreement.",
  },
];

const companyPages: DetailPageData[] = [
  {
    path: "company/about",
    eyebrow: "About me",
    title: "I am Sanjay Sudagani, founder of Nodezuno.",
    intro:
      "Crypto has felt like home since I entered the industry in 2020. After years exploring protocols, wallets, exchanges, DeFi, infrastructure, governance, and security failures, I started Nodezuno to help teams understand the exact risk introduced by an onchain upgrade.",
    kind: "company",
    accent: "lime",
    primaryCta: { label: "See the review service", href: "/product" },
    secondaryCta: { label: "Contact Sanjay", href: "/company/contact" },
    capabilities: [
      {
        index: "01",
        title: "Crypto since 2020",
        description:
          "My interest grew from following assets into studying protocols, wallets, infrastructure, governance, security failures, market structure, and the people building through every cycle.",
      },
      {
        index: "02",
        title: "Why this problem",
        description:
          "An audit is a snapshot, but protocols continue to upgrade. The dangerous gap is often the exact change between reviewed code, governance approval, deployment, and live state.",
      },
      {
        index: "03",
        title: "How I want to build",
        description:
          "Start with one painful paid service, make claims only when evidence supports them, work with experienced security reviewers, and turn repeated customer work into dependable software.",
      },
      {
        index: "04",
        title: "Who Nodezuno is for",
        description:
          "Protocol engineers, security leads, founders, signers, risk teams, and governance contributors responsible for smart contract or protocol releases that can affect user funds.",
      },
    ],
    workflow: [
      {
        label: "Conviction",
        title: "Onchain systems will hold more value",
        description:
          "Financial applications will keep becoming more programmable, interconnected, and upgradeable, increasing the cost of an incorrect release.",
      },
      {
        label: "Discipline",
        title: "Revenue before a platform story",
        description:
          "Nodezuno begins with a focused offer customers can evaluate and pay for, then earns the right to automate repeated work.",
      },
      {
        label: "Ambition",
        title: "Make release evidence standard",
        description:
          "The long-term goal is a trusted control plane between audited code, governance intent, and onchain execution.",
      },
    ],
    note:
      "Nodezuno is an early-stage founder-led project. This page does not imply an established team, named customers, completed audits, funding, certifications, or commercial traction that has not been publicly verified.",
  },
  {
    path: "company/contact",
    eyebrow: "Contact Nodezuno",
    title: "Contact Nodezuno.",
    intro:
      "Contact Nodezuno about partnerships, research, press, or general questions. Use the contact form or choose the relevant email address.",
    kind: "contact",
    accent: "blue",
    primaryCta: reviewCta,
    secondaryCta: { label: "Email info@nodezuno.com", href: "mailto:info@nodezuno.com" },
    capabilities: [
      {
        index: "01",
        title: "Release review",
        description:
          "Share only public or high-level details first: protocol name, ecosystem and network, upgrade target, prior review status, approximate scope, intended release date, and technical contact.",
      },
      {
        index: "02",
        title: "Security report",
        description:
          "Send suspected vulnerabilities in Nodezuno-owned systems to info@nodezuno.com and follow the responsible disclosure guidance before providing sensitive reproduction material.",
      },
      {
        index: "03",
        title: "Press and research",
        description:
          "Send media, analyst, speaking, or research enquiries to info@nodezuno.com with your outlet or organization, topic, intended use, and deadline.",
      },
      {
        index: "04",
        title: "General contact",
        description:
          "Use info@nodezuno.com for partnerships and company questions. Do not send private keys, seed phrases, passwords, production credentials, or confidential source without an approved secure channel.",
      },
    ],
    note:
      "No 24/7 response time or emergency protocol incident service is offered through the public website. Active customers should use the contact and escalation path stated in their signed engagement terms.",
  },
  {
    path: "contact/upgrade-assurance",
    eyebrow: "Smart Contract and Protocol Release Review",
    title: "Start a release review.",
    intro:
      `Share non-confidential details about the previously reviewed version, one planned release, target ecosystem and network, change size, and release date. The fixed ${reviewPriceLabels.total} service order opens immediately so you can accept the terms and continue to payment.`,
    kind: "contact",
    accent: "lime",
    primaryCta: { label: "Start a release review", href: "/review/start" },
    secondaryCta: { label: "Review scope requirements", href: "/pricing#scope" },
    capabilities: [
      {
        index: "01",
        title: "Protocol and ecosystem",
        description:
          "Provide the project name, website, ecosystem, network, deployed value context if public, contract or program category, and links to public repositories or documentation.",
      },
      {
        index: "02",
        title: "Release scope",
        description:
          "Describe the upgrade purpose, approximate changed lines or modules, affected contracts, programs, or components, upgrade mechanism, execution path, and whether the candidate is stable.",
      },
      {
        index: "03",
        title: "Previous audit and current version",
        description:
          "State when the current system was audited, by whom if public, whether findings were remediated, and whether source and deployed bytecode can be reproduced.",
      },
      {
        index: "04",
        title: "Timing and ownership",
        description:
          "Provide the desired release date, earliest date your review materials will be ready, time zone, technical contact, decision owner, and any procurement, confidentiality, or AI-use requirements.",
      },
    ],
    workflow: [
      {
        label: "Order",
        title: "Submit non-confidential service details",
        description:
          "Nodezuno creates the fixed service order immediately and does not ask for keys, credentials, or private source through an unapproved channel.",
      },
      {
        label: "Checkout",
        title: "Accept terms and complete payment",
        description:
          "The customer accepts the generated scope and service terms, chooses Ethereum Mainnet USDC or USDT, sends the exact scheduling deposit, and submits the transaction hash and Telegram username.",
      },
      {
        label: "Start",
        title: "Manual payment check comes before kickoff",
        description:
          "After the customer submits a transaction hash and Telegram username, Sanjay checks the transfer manually and emails the customer. Work starts only after payment is recorded, materials are ready, scope is confirmed, and reviewer availability is agreed.",
      },
    ],
    note:
      "Submitting the form creates a fixed service order but does not transfer funds. After accepting the service terms, the customer pays the scheduling deposit in Ethereum Mainnet USDC or USDT and submits the transaction hash and Telegram username. Sanjay checks it manually and confirms by email. Never submit private keys or production credentials.",
  },
  {
    path: "company/careers",
    eyebrow: "Careers at Nodezuno",
    title: "Future work at Nodezuno.",
    intro:
      "Nodezuno is not hiring today. Future work may include blockchain security, protocol engineering, financial and consensus rule testing, ecosystem-specific execution, and secure product infrastructure.",
    kind: "company",
    accent: "aqua",
    primaryCta: { label: "Send an introduction", href: "mailto:info@nodezuno.com" },
    secondaryCta: { label: "Read about Nodezuno", href: "/company/about" },
    capabilities: [
      {
        index: "01",
        title: "Security reviewers",
        description:
          "Relevant experience includes public audits, competitive findings, bounty work, exploit analysis, formal methods, fuzzing, and clear technical reporting with verifiable references.",
      },
      {
        index: "02",
        title: "Protocol engineers",
        description:
          "Relevant work includes Solidity and EVM systems, Rust and SVM systems, Move, Cosmos SDK, Substrate, upgrade patterns, governance execution, reproducible state testing, storage or account analysis, and economic state-machine reasoning.",
      },
      {
        index: "03",
        title: "Product engineers",
        description:
          "Future software will need isolated runners, reproducible builds, evidence provenance, secure workflows, role-based access, audit trails, and excellent developer experience.",
      },
      {
        index: "04",
        title: "Working principles",
        description:
          "Evidence before claims, customer safety before speed, direct communication, narrow commitments, responsible disclosure, and clear ownership of mistakes and corrections.",
      },
    ],
    note:
      "Open introductions only. Nodezuno does not currently publish a location, salary range, benefits package, employment type, interview process, visa policy, or hiring timeline because no role is open.",
  },
  {
    path: "company/newsroom",
    eyebrow: "Nodezuno newsroom",
    title: "Official Nodezuno updates.",
    intro:
      "Company, service, and research announcements will appear here with dates and supporting links. No announcements have been published yet.",
    kind: "company",
    accent: "violet",
    primaryCta: { label: "Open the press kit", href: "/company/press-kit" },
    secondaryCta: { label: "Email info@nodezuno.com", href: "mailto:info@nodezuno.com" },
    capabilities: [
      {
        index: "01",
        title: "Business updates",
        description:
          "Material changes to business focus, ownership, registration, financing, availability, and commercial operation should be published with verifiable context rather than implied through design or logos.",
      },
      {
        index: "02",
        title: "Product releases",
        description:
          "A release announcement must link to documentation, maturity, limits, security boundaries, pricing or access, migration details, and a support path.",
      },
      {
        index: "03",
        title: "Research releases",
        description:
          "Research should name authors, methods, source materials, artifact access, assumptions, limitations, publication date, and a correction history.",
      },
      {
        index: "04",
        title: "Media enquiries",
        description:
          "Journalists, analysts, event organizers, and researchers can request a briefing or fact check through info@nodezuno.com.",
      },
    ],
    note:
      "No named customer, funding, revenue, audit completion, partnership, award, certification, or production result should be inferred unless Nodezuno publishes a dated source for it.",
  },
  {
    path: "company/press-kit",
    eyebrow: "Nodezuno press kit",
    title: "Accurate business language and approved media resources.",
    intro:
      `Nodezuno is an early-stage, founder-led business providing smart contract and protocol release reviews across supported EVM and non-EVM ecosystems. Every supported review costs ${reviewPriceLabels.total}. The five-business-day target applies only to the standard EVM scope, while non-EVM schedules are stated in the service order. The seller is Sanjay Sudagani, sole proprietor trading as Nodezuno. Use the approved facts below and verify time-sensitive information before publication.`,
    kind: "company",
    accent: "lime",
    primaryCta: { label: "Email info@nodezuno.com", href: "mailto:info@nodezuno.com" },
    secondaryCta: { label: "Read about the founder", href: "/company/about" },
    capabilities: [
      {
        index: "01",
        title: "Approved boilerplate",
        description:
          "Nodezuno is the trade name used by Sanjay Sudagani for an early-stage business providing smart contract and protocol release reviews. It serves supported EVM and non-EVM ecosystems, compares each proposed release with a previously reviewed version, tests security-critical changes, and names the reviewer in the service order.",
      },
      {
        index: "02",
        title: "Founder",
        description:
          "Nodezuno was founded by Sanjay Sudagani, who has explored the crypto ecosystem since 2020 and is focused on improving the evidence behind high-impact onchain releases.",
      },
      {
        index: "03",
        title: "Current maturity",
        description:
          `Smart contract and protocol release review orders are open. EVM and non-EVM reviews share the same ${reviewPriceLabels.total} price. Chain-specific preparation, tools, and delivery estimates are confirmed at kickoff. Nodezuno has not published customer results, certifications, service levels, or proven commercial traction.`,
      },
      {
        index: "04",
        title: "Naming guidance",
        description:
          "Write the trade name as Nodezuno and the service as a Nodezuno Smart Contract and Protocol Release Security Review. Do not describe Nodezuno as incorporated, or the service as an audit replacement, certification, insurance product, autonomous system, or security guarantee.",
      },
    ],
    note:
      "Brand files and founder photography should be used only from the official press kit. Business registration, service address, location, headcount, financing, customer, and revenue facts must be confirmed directly before publication.",
  },
  {
    path: "company/investor-thesis",
    eyebrow: "Nodezuno company thesis",
    title: "Start with paid release reviews. Automate only what customers repeatedly need.",
    intro:
      `The initial business sells one ${reviewPriceLabels.total} smart contract or protocol release review across supported EVM and non-EVM ecosystems. The method, required materials, and schedule adapt to the chain, while the price and payment structure stay consistent. It serves protocols with a real release deadline and an existing security budget. The long-term product is software that continuously checks the path from reviewed code to approval and onchain deployment.`,
    kind: "company",
    accent: "amber",
    primaryCta: reviewCta,
    secondaryCta: { label: "Read the working paper", href: "/whitepaper" },
    capabilities: [
      {
        index: "01",
        title: "Immediate buyer trigger",
        description:
          "A protocol has a material upgrade scheduled, deployed value at risk, a small internal security team, and an existing reason to spend before governance or deployment proceeds.",
      },
      {
        index: "02",
        title: "Practical early economics",
        description:
          "Defined scope, upfront scheduling payment, low infrastructure cost, no custody, and one controlled remediation cycle can create a profitable learning loop without financing a broad platform first.",
      },
      {
        index: "03",
        title: "Every review improves the method",
        description:
          "Each engagement can improve reusable security checks, known failure patterns, release records, reviewer workflows, and repeatable testing tools without treating private customer code as a reusable dataset.",
      },
      {
        index: "04",
        title: "Expansion path",
        description:
          "Repeated reviews can become continuous pull-request checks, governance payload analysis, private runners, security policy, institutional approvals, and signed release records.",
      },
    ],
    workflow: [
      {
        label: "Prove demand",
        title: "Early paid engagements",
        description:
          "Validate willingness to pay, delivery quality, reviewer economics, gross margin, repeat purchase intent, and which evidence customers actually use.",
      },
      {
        label: "Productize",
        title: "Automate the repeated work",
        description:
          "Build only the intake, code comparison, fork testing, security checks, evidence, and reporting workflows that reduce delivery time or improve customer outcomes.",
      },
      {
        label: "Expand",
        title: "Connect security evidence to every release",
        description:
          "Connect protocol policies and verified evidence to governance, deployment, monitoring, auditors, insurers, institutions, and multi-chain release workflows.",
      },
    ],
    note:
      "This is a strategy hypothesis, not a forecast or investment solicitation. Market size, pricing, margins, retention, automation, and platform expansion remain unproven until supported by paid customer evidence.",
  },
];

const legalPages: DetailPageData[] = [
  {
    path: "legal",
    eyebrow: "Legal information",
    title: "Clear terms for an early-stage founder-led security business.",
    intro:
      "Nodezuno is a trade name used by Sanjay Sudagani, a sole proprietor. This hub links the website privacy notice, website terms, acceptable-use rules, and responsible disclosure guidance. Customer work is governed by the versioned service order and service terms accepted in the private checkout. Any additional signed agreement applies only when the order states one is required.",
    kind: "legal",
    accent: "blue",
    primaryCta: { label: "Read the terms", href: "/legal/terms" },
    secondaryCta: { label: "Read the privacy notice", href: "/legal/privacy" },
    capabilities: [
      {
        index: "01",
        title: "Website terms",
        description:
          "Rules for using public content, submitting enquiries, respecting intellectual property, and understanding informational limits.",
      },
      {
        index: "02",
        title: "Privacy notice",
        description:
          "The categories, purposes, retention, sharing, security, choices, and contact routes relevant to website and enquiry data.",
      },
      {
        index: "03",
        title: "Acceptable use",
        description:
          "Prohibited abuse, unauthorized access, harmful testing, deception, service interference, and misuse of forms or communication channels.",
      },
      {
        index: "04",
        title: "Customer agreements",
        description:
          "Scope, confidentiality, security, intellectual property, direct stablecoin settlement, cancellation, manual refunds, liability, review limitations, data handling, and deliverables are agreed separately for each engagement.",
      },
    ],
    note:
      "Draft website information requiring review by qualified counsel before production use. Nothing on this page creates an attorney-client relationship or replaces signed engagement terms.",
  },
  {
    path: "legal/privacy",
    eyebrow: "Privacy notice",
    title: "Collect less, explain why, and delete on purpose.",
    intro:
      "This notice is intended to describe data handled through the public Nodezuno website and pre-engagement enquiries. Signed customer agreements should govern confidential source code, review artifacts, security findings, and engagement records.",
    kind: "legal",
    accent: "aqua",
    primaryCta: { label: "Contact info@nodezuno.com", href: "mailto:info@nodezuno.com" },
    secondaryCta: { label: "Read the terms", href: "/legal/terms" },
    capabilities: [
      {
        index: "01",
        title: "Data collected",
        description:
          "Website requests may include IP address, device and browser metadata, requested pages, security logs, cookies required for operation, and information you submit such as name, work email, organization, Telegram username, transaction hash, project context, and message.",
      },
      {
        index: "02",
        title: "Why it is used",
        description:
          "Data may be used to operate and protect the website, respond to enquiries, process release review orders, maintain records, prevent abuse, comply with law, and improve the clarity and reliability of Nodezuno services.",
      },
      {
        index: "03",
        title: "Sharing and transfer",
        description:
          "Information may be processed by vetted hosting, security, communication, and professional-service providers under appropriate terms, or disclosed when legally required. Ethereum transaction details are public by design. Nodezuno does not currently sell personal data.",
      },
      {
        index: "04",
        title: "Retention and choices",
        description:
          "Data should be retained only for operational, security, contractual, and legal needs. You may request access, correction, deletion, or information about applicable rights through info@nodezuno.com, subject to verification and lawful exceptions.",
      },
    ],
    workflow: [
      {
        label: "Website",
        title: "Operational data",
        description:
          "Security and access logs support availability, abuse prevention, diagnostics, and incident investigation under a documented retention schedule.",
      },
      {
        label: "Enquiry",
        title: "Contact data",
        description:
          "Submitted information is used to create or operate the requested service order, answer enquiries, record consent or preferences, and maintain an appropriate business history.",
      },
      {
        label: "Engagement",
        title: "Separate confidential terms",
        description:
          "Private code, findings, credentials, reviewer notes, and customer evidence require explicit contractual controls beyond this website summary.",
      },
    ],
    note:
      "Draft privacy notice. The operator is Sanjay Sudagani, sole proprietor trading as Nodezuno. A service address, subprocessors, transfer mechanism, cookie inventory, retention periods, and jurisdiction-specific disclosures must be completed and reviewed by qualified counsel before public commercial launch.",
  },
  {
    path: "legal/terms",
    eyebrow: "Website terms",
    title: "Use the website as information, not as a security guarantee.",
    intro:
      "These draft terms govern public website use and general enquiries. The release-review form creates a service order, but work begins only under the accepted order and service terms after Sanjay manually checks and records payment. Public website content does not authorize reliance on Nodezuno for a protocol release.",
    kind: "legal",
    accent: "violet",
    primaryCta: { label: "Read acceptable use", href: "/legal/acceptable-use" },
    secondaryCta: { label: "Contact Nodezuno", href: "/company/contact" },
    capabilities: [
      {
        index: "01",
        title: "Informational content",
        description:
          "Website material may change, may contain errors, and is provided for general information. It is not security certification, legal advice, financial advice, insurance, an audit report, or a recommendation to deploy or transact.",
      },
      {
        index: "02",
        title: "No active engagement from the form alone",
        description:
          "Submitting the release-review form creates a service order, but does not start work, reserve reviewer time, or create confidentiality for unsolicited materials. The engagement becomes active only after the customer accepts the service order and terms and Sanjay manually checks and records the scheduling payment. Required materials, scope, conflicts, and reviewer availability must also be confirmed before work begins.",
      },
      {
        index: "03",
        title: "Intellectual property",
        description:
          "Nodezuno names, marks, site design, text, and original materials remain protected. Limited ordinary website use is allowed, but copying, misrepresentation, resale, or removal of notices is not authorized.",
      },
      {
        index: "04",
        title: "Warranty and liability boundary",
        description:
          "To the extent permitted by applicable law, the website is provided without warranties and Nodezuno disclaims liability for decisions made from public content. Mandatory legal rights and signed customer terms are not excluded.",
      },
    ],
    workflow: [
      {
        label: "Access",
        title: "Use public surfaces lawfully",
        description:
          "Do not bypass controls, probe private resources, interfere with operation, impersonate others, submit unlawful material, or test systems outside published authorization.",
      },
      {
        label: "Links",
        title: "Evaluate third parties independently",
        description:
          "External websites, chains, protocols, repositories, tools, and providers are controlled by others and may change without Nodezuno's review or endorsement.",
      },
      {
        label: "Changes",
        title: "Check the effective version",
        description:
          "Material terms should include an effective date and change history. Continued website use after publication may be subject to the updated version where legally permitted.",
      },
    ],
    note:
      "Draft terms for Sanjay Sudagani, sole proprietor trading as Nodezuno. Governing law, venue, service address, tax and invoice treatment, cross-border stablecoin settlement, statutory disclosures, effective date, and dispute terms require review by qualified counsel before production use.",
  },
  {
    path: "legal/acceptable-use",
    eyebrow: "Acceptable use",
    title: "Protect users, customers, researchers, and the service.",
    intro:
      "This draft policy defines prohibited use of Nodezuno-owned websites, forms, accounts, repositories, and future services. Separate customer and responsible-disclosure terms may add narrower permissions.",
    kind: "legal",
    accent: "amber",
    primaryCta: { label: "Read responsible disclosure", href: "/security/responsible-disclosure" },
    secondaryCta: { label: "Read the terms", href: "/legal/terms" },
    capabilities: [
      {
        index: "01",
        title: "No unauthorized access",
        description:
          "Do not access another person's data, credentials, private repositories, engagement artifacts, administrative surfaces, infrastructure, or restricted functionality without explicit authorization.",
      },
      {
        index: "02",
        title: "No harmful interference",
        description:
          "Do not disrupt availability, introduce malware, automate abusive traffic, exhaust resources, evade limits, damage data, exploit production systems, or impair incident response.",
      },
      {
        index: "03",
        title: "No deceptive or unlawful use",
        description:
          "Do not impersonate others, misrepresent authorization or findings, infringe rights, submit illegal content, facilitate theft, manipulate markets, or use Nodezuno to attack third parties.",
      },
      {
        index: "04",
        title: "Use the disclosure path",
        description:
          "Good-faith research must remain inside the published Nodezuno-owned scope, minimize impact and data access, stop after minimal proof, and be reported privately through the responsible disclosure channel.",
      },
    ],
    note:
      "Draft policy. Enforcement, suspension, investigation, appeal, safe-harbor, and jurisdiction-specific terms require counsel and operational review before production publication.",
  },
];

const pricingPage: DetailPageData = {
  path: "pricing",
  eyebrow: "One Fixed Price",
  title: `${reviewPriceLabels.total} for one smart contract or protocol release review.`,
  intro:
    `The same ${reviewPriceLabels.total} price applies to every supported EVM and non-EVM review. Each order covers one network and one release, with a ${reviewPriceLabels.deposit} scheduling deposit and ${reviewPriceLabels.balance} due before the final report. Standard EVM reviews target ${reviewPolicy.evmTargetBusinessDays} business days after readiness. Non-EVM delivery estimates are confirmed at kickoff.`,
  kind: "pricing",
  accent: "lime",
  primaryCta: reviewCta,
  secondaryCta: { label: "See what is included", href: "/product" },
  stats: [
    { value: `${reviewPriceLabels.total}`, label: "every review" },
    { value: "50% / 50%", label: "at scheduling / before final report" },
    { value: "1", label: "fix review included" },
  ],
  capabilities: [
    {
      index: "01",
      title: "One price across supported chains",
      description:
        `${reviewPriceLabels.total} for one planned release on one supported EVM or non-EVM network. The scheduling deposit and final balance are each ${reviewPriceLabels.deposit}.`,
    },
    {
      index: "02",
      title: "What is included",
      description:
        "Written scope, a record of the exact release, code and permissions review, targeted fork testing, prioritized findings, reproducible evidence where feasible, one fix review, and a final recommendation.",
    },
    {
      index: "03",
      title: "Payment terms",
      description:
        "Pay 50 percent after accepting the generated fixed service order and 50 percent before final report delivery. Payment is accepted only in USDC or USDT on Ethereum Mainnet through the private portal. After each transfer, submit its transaction hash and Telegram username for a manual check. Additional scope and applicable taxes are separate.",
    },
    {
      index: "04",
      title: "What is not included",
      description:
        `Multiple networks, extra release payloads, unrelated changes, or additional remediation cycles do not fit one review. They require another separately accepted ${reviewPriceLabels.total} engagement or are declined before payment. Formal verification, specialist cryptography, incident response, travel, and expedited work are not included.`,
    },
  ],
  workflow: [
    {
      label: "Submit",
      title: "Create the fixed service order",
      description:
        "Submit one supported network, one reviewed baseline, one release, and a change within the published component and code-line limits. The private checkout opens immediately.",
    },
    {
      label: "Contract",
      title: "Fix scope and responsibility",
      description:
        "A statement of work controls scope, exclusions, dates, reviewers, confidentiality, data handling, deliverables, fees, and change requests.",
    },
    {
      label: "Deliver",
      title: "Pay against clear milestones",
      description:
        `Sanjay manually checks and records the ${reviewPriceLabels.deposit} scheduling payment before kickoff. The remaining ${reviewPriceLabels.balance} is due before final report delivery and is also checked manually. The standard EVM five-business-day target begins only after all required artifacts are ready. Non-EVM completion estimates are confirmed at kickoff.`,
    },
  ],
  note:
    `EVM and non-EVM reviews use the same ${reviewPriceLabels.total} price. Your order records the submitted chain and scope before payment. Preparation and the completion estimate are confirmed at kickoff. All work is subject to the accepted terms, tax, invoicing, jurisdiction, and payment rules. Direct stablecoin settlement does not remove compliance duties. No subscription or unlisted recurring charge is implied.`,
};

const contactAliases: DetailPageData[] = [
  {
    path: "contact/sales",
    eyebrow: "Release Review Enquiries",
    title: "Tell us about the smart contract or protocol release you want reviewed.",
    intro:
      "Use the structured intake to share the protocol, ecosystem and network, previously reviewed baseline, planned release, and target date. A valid bounded submission creates the fixed service order and opens the private checkout.",
    kind: "contact",
    accent: "lime",
    primaryCta: reviewCta,
    secondaryCta: { label: "Email info@nodezuno.com", href: "mailto:info@nodezuno.com" },
    capabilities: [
      {
        index: "01",
        title: "Your contact details",
        description:
          "Protocol founder, engineering lead, security lead, risk lead, governance contributor, or signer accountable for an upcoming blockchain release.",
      },
      {
        index: "02",
        title: "Trigger",
        description:
          "A material smart contract or protocol release is planned within approximately 30 days and the team needs supplemental evidence beyond the prior review before execution.",
      },
      {
        index: "03",
        title: "First information",
        description:
          "Public project links, release purpose, approximate scope, audit history, target date, and contact details. Private code and files wait for signed terms and an approved channel.",
      },
      {
        index: "04",
        title: "Next step",
        description:
          "A valid bounded submission creates the fixed service order immediately. After terms are accepted, the customer submits payment details for a manual check. Work begins after Sanjay records the payment, required materials are ready, and scope, conflict, and reviewer availability checks are complete.",
      },
    ],
    note:
      "No engagement is formed by an enquiry. Do not send private keys, seed phrases, credentials, exploit material, or confidential source through the public form.",
  },
  {
    path: "contact/press",
    eyebrow: "Press enquiries",
    title: "Request accurate information about Nodezuno.",
    intro:
      "Journalists, analysts, researchers, and event organizers can request a briefing, comment, founder biography, product fact check, or approved brand asset.",
    kind: "contact",
    accent: "violet",
    primaryCta: { label: "Email info@nodezuno.com", href: "mailto:info@nodezuno.com" },
    secondaryCta: { label: "Open the press kit", href: "/company/press-kit" },
    capabilities: [
      {
        index: "01",
        title: "Include your context",
        description:
          "State your name, outlet or organization, topic, intended use, format, publication or event date, deadline, and the specific fact or perspective requested.",
      },
      {
        index: "02",
        title: "Verify product maturity",
        description:
          `Smart contract and protocol release review orders are open at one ${reviewPriceLabels.total} price for EVM and non-EVM engagements. Ask before describing customers, revenue, reviewer team, certifications, or completed security work.`,
      },
      {
        index: "03",
        title: "Use approved language",
        description:
          "Nodezuno reviews planned smart contract and protocol releases across supported EVM and non-EVM ecosystems. It should not be described as autonomous security, an audit replacement, insurance, or a guarantee.",
      },
      {
        index: "04",
        title: "Respect confidentiality",
        description:
          "Nodezuno will not discuss private customer enquiries, undisclosed findings, confidential source, or engagement details without documented authorization.",
      },
    ],
  },
];

const allPages: DetailPageData[] = [
  ...productPages,
  ...methodologyPages,
  ...securityPages,
  ...resourcePages,
  ...companyPages,
  ...legalPages,
  pricingPage,
  ...contactAliases,
];

const pageMap = new Map(allPages.map((page) => [page.path, page]));

export function getPageData(path: string): DetailPageData | undefined {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const direct = pageMap.get(normalized);
  if (direct) return direct;

  const canonicalPath = legacyPublicAliases[normalized]?.replace(/^\/+/, "");
  const canonical = canonicalPath ? pageMap.get(canonicalPath) : undefined;
  return canonical;
}

export function getAllPagePaths(): string[] {
  return [...pageMap.keys()].filter(
    (path) => path !== "contact/upgrade-assurance",
  );
}

export const planeData = [
  {
    id: "baseline",
    kicker: "Baseline",
    name: "Release definition",
    title: "Freeze the exact system and change under review.",
    description:
      "Bind the reviewed baseline, candidate artifacts, build settings, deployed identifiers, upgrade instructions, network state, assumptions, owners, and exclusions into one release record.",
    features: [
      "Audited baseline",
      "Semantic change map",
      "Authority delta",
      "Artifact hashes",
    ],
    accent: "lime",
    href: "/product#coverage",
  },
  {
    id: "challenge",
    kicker: "Challenge",
    name: "Adversarial execution",
    title: "Test the riskiest changes in a reproducible environment.",
    description:
      "Use human review, appropriate tooling, targeted execution, and protocol-specific security rules to challenge the proposed release. Standard EVM reviews use pinned fork testing. Non-EVM reviews use a chain-specific test plan confirmed at kickoff.",
    features: [
      "Attack hypotheses",
      "Reproducible execution",
      "Critical properties",
      "Evidence traces",
    ],
    accent: "blue",
    href: "/methodology",
  },
  {
    id: "decide",
    kicker: "Decide",
    name: "Human recommendation",
    title: "Give engineering and governance one inspectable record.",
    description:
      "Connect findings to evidence, verify one remediation set, record residual risk, and issue a Proceed, Remediate, or Hold recommendation tied to the exact artifacts reviewed.",
    features: [
      "Findings register",
      "Fix verification",
      "Human sign-off",
      "Release boundary",
    ],
    accent: "violet",
    href: "/product#deliverables",
  },
];

export const useCases = [
  {
    id: "lending-stablecoins",
    label: "Lending and stablecoins",
    headline: "Protect solvency, accounting, pricing, and liquidation assumptions.",
    copy:
      "Review implementation, state, oracle, role, reserve, interest, liquidation, mint, redemption, and governance changes against the guarantees users and risk teams depend on.",
    metrics: ["Solvency invariants", "Oracle boundaries", "Authority deltas"],
    href: "/product#coverage",
  },
  {
    id: "vaults-rwa",
    label: "Vaults and tokenized assets",
    headline: "Challenge share accounting and asset-control changes before release.",
    copy:
      "Test deposits, withdrawals, conversions, fees, valuation, strategy adapters, permissioned roles, settlement assumptions, and state migrations in a representative chain environment.",
    metrics: ["Asset conservation", "Share accounting", "Role changes"],
    href: "/product#coverage",
  },
  {
    id: "bridges",
    label: "Bridges and interoperability",
    headline: "Make changed trust and message assumptions explicit.",
    copy:
      "Inspect verification, relaying, replay protection, mint and release authority, pausing, rate limits, token behavior, remote dependencies, and governance payload execution.",
    metrics: ["Replay safety", "Message validity", "Custody authority"],
    href: "/product#coverage",
  },
  {
    id: "governance",
    label: "Governance-controlled protocols",
    headline: "Review the payload that governance will actually execute.",
    copy:
      "Connect proposal intent, execution instructions, target components, timelock state, permissions, release artifacts, configuration changes, and post-execution checks into one reviewable release record.",
    metrics: ["Action execution", "Timelock state", "Post-state checks"],
    href: "/methodology",
  },
];

export const chainDirectory = [
  { name: "Ethereum", family: "EVM L1", finality: "Protocol dependent", support: "Standard EVM candidate", tone: "blue" },
  { name: "Arbitrum One", family: "EVM L2", finality: "Rollup dependent", support: "EVM scope review required", tone: "aqua" },
  { name: "Base", family: "EVM L2", finality: "Rollup dependent", support: "EVM scope review required", tone: "blue" },
  { name: "OP Mainnet", family: "EVM L2", finality: "Rollup dependent", support: "EVM scope review required", tone: "red" },
  { name: "Polygon PoS", family: "EVM", finality: "Network dependent", support: "EVM scope review required", tone: "violet" },
  { name: "Avalanche C-Chain", family: "EVM", finality: "Network dependent", support: "EVM scope review required", tone: "red" },
  { name: "Solana", family: "SVM", finality: "Network dependent", support: "Custom fit and reviewer check", tone: "aqua" },
  { name: "Cosmos SDK chains", family: "Cosmos", finality: "Chain dependent", support: "Custom fit and reviewer check", tone: "violet" },
  { name: "Sui and Aptos", family: "Move", finality: "Network dependent", support: "Custom fit and reviewer check", tone: "blue" },
  { name: "Polkadot and Substrate", family: "Substrate", finality: "Chain dependent", support: "Custom fit and reviewer check", tone: "red" },
];
