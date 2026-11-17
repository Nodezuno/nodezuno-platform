import Link from "next/link";
import dynamic from "next/dynamic";
import type { DetailPageData } from "@/lib/site-data";
import { Reveal } from "./client-effects";
import { FaqExperience } from "./faq-experience";
import { ContactPage, InformationPage } from "./information-page";
import { FounderExperience } from "./founder-experience";
import { LegalExperience } from "./legal-experience";
import { CommercialPage } from "./commercial-page";
import { StatusExperience } from "./detail-status-experience";
import { ContactExperience, type SubmissionFormVariant } from "./detail-contact-experience";
import { NewsletterExperience } from "./detail-newsletter-experience";

// Client tools keep SSR enabled so their initial text and anchors are available
// before hydration. Static founder/legal content stays in the server graph.
const DocumentationExperience = dynamic(() => import("./documentation-experience").then((module) => module.DocumentationExperience));
const PressKitExperience = dynamic(() => import("./press-kit-experience").then((module) => module.PressKitExperience));
const WhitepaperExperience = dynamic(() => import("./whitepaper-experience").then((module) => module.WhitepaperExperience));

function DetailVisual({ page }: { page: DetailPageData }) {
  return (
    <div className={`detail-visual detail-visual-${page.accent}`} aria-hidden="true">
      <div className="detail-grid-lines" />
      <div className="detail-record-head">
        <span>RELEASE REVIEW RECORD</span>
        <strong>SCOPE BOUND</strong>
      </div>
      <div className="detail-record-versions">
        <div>
          <small>PREVIOUS VERSION</small>
          <strong>Audit baseline</strong>
          <span>Recorded</span>
        </div>
        <i>→</i>
        <div>
          <small>NEXT VERSION</small>
          <strong>Planned release</strong>
          <span>In review</span>
        </div>
      </div>
      <div className="detail-record-checks">
        <div><span>01</span><strong>Code and behavior</strong><b>COMPARE</b></div>
        <div><span>02</span><strong>State and configuration</strong><b>TEST</b></div>
        <div><span>03</span><strong>Authority and release action</strong><b>PROVE</b></div>
      </div>
      <div className="detail-record-result">
        <div>
          <small>FINAL OUTPUT</small>
          <strong>Proceed / Remediate / Hold</strong>
        </div>
        <span>Reviewer signed</span>
      </div>
    </div>
  );
}

const breadcrumbLabels: Record<string, string> = {
  "how-it-works": "How it works",
  "press-kit": "Press kit",
  product: "Release review",
};

function breadcrumbLabel(segment: string) {
  const known = breadcrumbLabels[segment];
  if (known) return known;
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function DetailPage({
  page,
}: {
  page: DetailPageData;
}) {
  const pathParts = page.path.split("/");
  const categoryPath = pathParts.length > 1 ? pathParts[0] : null;
  const currentPath = pathParts[pathParts.length - 1];
  const formVariantByPath: Partial<
    Record<string, SubmissionFormVariant>
  > = {
    "company/contact": "general",
    "contact/press": "press",
    "company/careers": "career",
    "security/responsible-disclosure": "security",
  };
  const formVariant = formVariantByPath[page.path];
  const isDocumentation =
    page.path === "docs" ||
    page.path === "resources/docs" ||
    page.path === "developers/docs";
  const isWhitepaper = page.path === "whitepaper";
  const isFaq = page.path === "faq";
  const isFounder = page.path === "company/about";
  const isGeneralContact = page.path === "company/contact";
  const isUpgradeAssurance =
    page.path === "product" ||
    page.path.startsWith("product/") ||
    page.path === "how-it-works" ||
    page.path.startsWith("how-it-works/") ||
    page.path === "methodology" ||
    page.path === "security" ||
    page.path === "pricing";
  const capabilitySectionCopy = page.path.startsWith("product")
    ? {
        kicker: "What the review covers",
        title: "Four parts of every release review.",
        description:
          "We compare the planned release with the previously audited or professionally reviewed version, test the highest-risk changes in an appropriate reproducible chain environment, and tie every accepted finding to evidence your engineers can inspect.",
      }
    : page.path === "methodology" || page.path.startsWith("how-it-works/")
      ? {
          kicker: "How the review works",
          title: "A clear process from request to recommendation.",
          description:
            "Each step explains what your team provides, what Nodezuno reviews, what evidence is produced, and what the final recommendation covers.",
        }
      : page.path.startsWith("security")
        ? {
            kicker: "How responsibility is divided",
            title: "Clear controls for data, evidence, and release authority.",
            description:
              "Nodezuno limits access, requires evidence for material findings, keeps AI inside an approved role, and leaves every deployment decision with your team.",
          }
        : page.kind === "status"
          ? {
              kicker: "Services reported here",
              title: "Current website and review-service boundaries.",
              description:
                "The status page separates working public services, individually scheduled review work, and future software that is not yet available.",
            }
          : page.kind === "contact"
            ? {
                kicker: "Choose the right contact route",
                title: "Send the right information to the right place.",
                description:
                  "Start a release review through the structured order form. Use the listed email routes for company, press, careers, privacy, or security questions.",
              }
            : page.kind === "legal"
              ? {
                  kicker: "What this policy covers",
                  title: "The rules and boundaries for this website.",
                  description:
                    "These pages explain public website use and pre-engagement data handling. Signed customer agreements control accepted review work.",
                }
              : page.kind === "company"
                ? {
                    kicker: "What you need to know",
                    title: "Clear facts about Nodezuno.",
                    description:
                      "This page explains the current company, service, and next step without implying customers, results, or capabilities that have not been published.",
                  }
                : {
                    kicker: "Page overview",
                    title: "The important information in one place.",
                    description:
                      "Review the purpose, scope, limits, and next action for this part of Nodezuno.",
                  };
  const workflowHeading =
    page.path === "product"
      ? "What you receive at the end of the review."
      : page.path.startsWith("product") ||
        page.path === "methodology" ||
        page.path.startsWith("how-it-works/") ||
        page.kind === "pricing"
        ? "From review request to final recommendation."
        : page.path === "company/investor-thesis"
          ? "How the business develops."
          : page.path.startsWith("security")
            ? "How the controls apply."
            : page.kind === "legal"
              ? "How this policy applies."
              : page.kind === "company" || page.kind === "contact"
                ? "What happens next."
                : "What happens from start to finish.";
  const hasStandaloneExperience =
    isDocumentation || isWhitepaper || isFaq || isFounder || page.kind === "pricing";
  const specialized =
    isDocumentation ? (
      <DocumentationExperience />
    ) : isWhitepaper ? (
      <WhitepaperExperience />
    ) : isFaq ? (
      <FaqExperience page={page} />
    ) : isFounder ? (
      <FounderExperience />
    ) : page.path === "company/press-kit" ? (
      <PressKitExperience />
    ) : page.kind === "legal" ? (
      <LegalExperience path={page.path} />
    ) : page.kind === "status" ? (
      <StatusExperience />
    ) : page.path === "community/newsletter" ? (
      <NewsletterExperience />
    ) : formVariant ? (
      <ContactExperience variant={formVariant} />
    ) : null;
  if (isGeneralContact) {
    return <ContactPage><ContactExperience variant="general" compact /></ContactPage>;
  }
  if (isFounder) {
    return <main id="main-content"><FounderExperience /></main>;
  }
  if (isDocumentation) {
    return <main className="documentation-page" id="main-content"><DocumentationExperience /></main>;
  }
  const isCommercialPage = page.path === "product" || page.path === "methodology" || page.kind === "pricing";
  if (isCommercialPage) {
    return <CommercialPage page={page} />;
  }
  if (!isCommercialPage && !isWhitepaper && !isFaq) {
    return <InformationPage page={page} showOverview={!specialized || Boolean(formVariant)}>{specialized}</InformationPage>;
  }
  const pageMode = isDocumentation || isWhitepaper || isFaq || isFounder || page.kind === "resource" || page.kind === "legal"
    ? "document"
    : page.kind === "pricing"
      ? "commercial"
      : "marketing";

  return (
    <main
      className={`detail-page accent-${page.accent}`}
      data-page-mode={pageMode}
      id="main-content"
    >
      {!isWhitepaper && !isFaq ? (
        <section className="detail-hero">
          <div className="detail-hero-grid" aria-hidden="true" />
          <div className="container">
            <div className="breadcrumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span>/</span>
              {categoryPath ? (
                <>
                  <Link href={`/${categoryPath}`}>
                    {breadcrumbLabel(categoryPath)}
                  </Link>
                  <span>/</span>
                  <strong>{breadcrumbLabel(currentPath)}</strong>
                </>
              ) : (
                <strong>{breadcrumbLabel(currentPath)}</strong>
              )}
            </div>
            <div className="detail-hero-layout">
              <div className="detail-hero-copy">
                <div className="eyebrow">
                  <span className="eyebrow-index">
                    NZ / {page.kind.toUpperCase()}
                  </span>
                  {page.eyebrow}
                </div>
                <h1>{page.title}</h1>
                <p>{page.intro}</p>
                <div className="hero-actions">
                  {page.primaryCta ? (
                    <Link
                      className="button button-solid button-large"
                      href={page.primaryCta.href}
                    >
                      {page.primaryCta.label}{" "}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  ) : null}
                  {page.secondaryCta ? (
                    <Link
                      className="button button-outline button-large"
                      href={page.secondaryCta.href}
                    >
                      {page.secondaryCta.label}
                    </Link>
                  ) : null}
                </div>
              </div>
              {pageMode === "marketing" && !isFounder ? <DetailVisual page={page} /> : null}
            </div>
            {page.stats ? (
              <div className="detail-stats">
                {page.stats.map((stat) => (
                  <div key={stat.label}>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
                <small>
                  {isUpgradeAssurance
                    ? "Published targets and scope limits, not a security guarantee"
                    : "Published scope, not an availability claim"}
                </small>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {specialized ? (
        <div className={`container special-wrap${isFaq ? " special-wrap-faq" : isWhitepaper ? " special-wrap-whitepaper" : ""}`}>
          {specialized}
        </div>
      ) : null}

      {!hasStandaloneExperience ? (
        <section
          className="capability-section section-pad"
          id={
            page.path === "product"
              ? "coverage"
              : page.path === "methodology"
                ? "evidence"
                : page.path === "security"
                  ? "ai-and-human-review"
                  : undefined
          }
        >
          <div className="container">
            <Reveal className="split-heading">
              <div>
                <span className="section-kicker">
                  {capabilitySectionCopy.kicker}
                </span>
                <h2>{capabilitySectionCopy.title}</h2>
              </div>
              <div className="split-copy">
                <p>{capabilitySectionCopy.description}</p>
              </div>
            </Reveal>
            <div className="capability-grid">
              {page.capabilities.map((capability, index) => (
                <Reveal className="capability-card" delay={(index % 4) * 70} key={capability.title}>
                  <div className="capability-index">
                    <span>{capability.index}</span>
                    <i aria-hidden="true" />
                  </div>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                </Reveal>
              ))}
            </div>
            {page.note ? <p className="page-note">{page.note}</p> : null}
          </div>
        </section>
      ) : null}

      {page.workflow && !hasStandaloneExperience ? (
        <section
          className="detail-workflow-section section-pad"
          id={
            page.path === "product"
              ? "deliverables"
              : page.path === "methodology"
                ? "process"
                : undefined
          }
        >
          <div className="container">
            <Reveal className="section-heading">
              <span className="section-kicker">How it works</span>
              <h2>{workflowHeading}</h2>
            </Reveal>
            <div className="detail-workflow-grid">
              {page.workflow.map((step, index) => (
                <Reveal className="detail-workflow-card" delay={index * 90} key={step.title}>
                  <div>
                    <span>0{index + 1}</span>
                    <small>{step.label}</small>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <i aria-hidden="true" />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

    </main>
  );
}
