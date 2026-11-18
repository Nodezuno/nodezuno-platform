"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useState } from "react";

const boilerplate =
  "Nodezuno provides fixed-scope cybersecurity reviews for planned smart contract and protocol upgrades across supported EVM and non-EVM ecosystems. We compare the candidate release with the version covered by a prior audit or professional security review, test material risks introduced by the changes, and deliver prioritized findings, evidence where feasible, and a reviewer-signed Proceed, Remediate, or Hold recommendation. Every supported review costs $7,500, paid as a $3,750 scheduling deposit and a $3,750 final balance. Preparation, tools, and delivery timing adapt to the selected ecosystem. Nodezuno does not hold keys or deploy customer code, does not replace a full audit, and does not let AI approve a release.";

const assets = [
  {
    title: "Primary wordmark",
    detail: "Dark horizontal SVG · scalable",
    href: "/nodezuno-wordmark.svg",
    height: 112,
    preview: "/nodezuno-wordmark.svg",
    width: 460,
  },
  {
    title: "Nodezuno mark",
    detail: "Square SVG · scalable",
    href: "/nodezuno-mark.svg",
    height: 96,
    preview: "/nodezuno-mark.svg",
    width: 96,
  },
  {
    title: "Social card",
    detail: "1200 × 630 PNG",
    href: "/og.png",
    height: 630,
    preview: "/og.png",
    width: 1200,
  },
  {
    title: "Favicon",
    detail: "128 × 128 PNG",
    href: "/favicon.png",
    height: 128,
    preview: "/favicon.png",
    width: 128,
  },
  {
    title: "Founder portrait",
    detail: "Sanjay Sudagani · 1200 × 1600 WebP",
    href: "/sanjay-sudagani-founder.webp",
    height: 1600,
    preview: "/sanjay-sudagani-founder.webp",
    width: 1200,
  },
];

export function PressKitExperience() {
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "error"
  >("idle");

  async function copyBoilerplate() {
    try {
      await navigator.clipboard.writeText(boilerplate);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 3000);
    }
  }

  return (
    <section className="press-kit-module">
      <div className="press-kit-head">
        <div>
          <span className="section-kicker">Approved media resources</span>
          <h2>Clear assets. Clear claims.</h2>
          <p>
            Use the language and files below for editorial coverage. Do not
            describe proposed product capabilities as publicly available.
          </p>
        </div>
        <Link className="button button-solid" href="/contact/press">
          Contact press <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className="press-facts">
        <div>
          <small>Category</small>
          <strong>Smart contract and protocol cybersecurity reviews</strong>
        </div>
        <div>
          <small>Stage</small>
          <strong>Opening review capacity</strong>
        </div>
        <div>
          <small>Initial focus</small>
          <strong>Previously reviewed EVM and non-EVM protocols</strong>
        </div>
        <div>
          <small>Public research</small>
          <strong>Standard EVM review whitepaper</strong>
        </div>
      </div>

      <div className="press-boilerplate">
        <div>
          <span>APPROVED BOILERPLATE / SHORT FORM</span>
          <div className="copy-action">
            <span
              aria-live="polite"
              className={
                copyStatus === "error"
                  ? "copy-feedback copy-feedback-error"
                  : "copy-feedback"
              }
            >
              {copyStatus === "copied"
                ? "Copied to clipboard"
                : copyStatus === "error"
                  ? "Copy failed. Select the text below."
                  : ""}
            </span>
            <button onClick={copyBoilerplate} type="button">
              {copyStatus === "copied"
                ? "Copied"
                : copyStatus === "error"
                  ? "Try again"
                  : "Copy text"}
            </button>
          </div>
        </div>
        <p>{boilerplate}</p>
      </div>

      <div className="press-assets">
        {assets.map((asset) => (
          <a download href={asset.href} key={asset.href}>
            <span className="press-asset-preview">
              {/* A normal image keeps the downloadable media assets
                  framework-independent and exact. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`${asset.title} preview`}
                decoding="async"
                height={asset.height}
                loading="lazy"
                src={asset.preview}
                width={asset.width}
              />
            </span>
            <span>
              <strong>{asset.title}</strong>
              <small>{asset.detail}</small>
            </span>
            <i aria-hidden="true">↓</i>
          </a>
        ))}
      </div>

      <div className="press-guidance">
        <div>
          <span>COLOR SYSTEM</span>
          <div className="press-swatches">
            <i style={{ "--swatch": "#070908" } as CSSProperties}>#070908</i>
            <i style={{ "--swatch": "#F2F1E9" } as CSSProperties}>#F2F1E9</i>
            <i style={{ "--swatch": "#C7FF45" } as CSSProperties}>#C7FF45</i>
            <i style={{ "--swatch": "#60F3D0" } as CSSProperties}>#60F3D0</i>
          </div>
        </div>
        <div>
          <span>USAGE</span>
          <ul>
            <li>Keep clear space equal to the symbol’s outer node radius.</li>
            <li>Use approved files without stretching, recoloring, or effects.</li>
            <li>Do not imply customer, partner, investor, or chain endorsement.</li>
            <li>Verify legal entity and leadership facts directly with press.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
