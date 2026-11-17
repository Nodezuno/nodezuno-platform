# Rendering and module boundaries

Status: incremental architecture, updated 2026-10-06. No measured Core Web Vitals or bundle-size claim is made.

## Current boundaries

- `app/[...slug]/page.tsx` remains a server route. It resolves canonical redirects and not-found handling before rendering a detail page.
- `components/detail-page.tsx` is now a server component. It selects the page experience and renders static headings, overview content, pricing, breadcrumbs, visual markup, maturity notices, and capability/workflow sections without placing those functions in a client component.
- Founder and legal experiences are direct server imports. Their static text and layout no longer become client code through the detail-page parent. `InformationPage` and `ContactPage` also remain server components; the contact form is passed as a client child.
- Status, chain-directory filtering, gas calculations, contact forms, newsletter signup, and AI previews are separate client modules by responsibility. Their initial markup, state, effect cleanup, fetch behavior, idempotency, abuse challenges, field errors, success states, and existing anchors are retained. Only the browser interactions moved; service behavior was not rewritten.
- Documentation, press-kit, and whitepaper modules retain default-SSR dynamic imports. This preserves their existing rendering boundary, without claiming that a server-to-client dynamic import proves an automatic bundle reduction.
- FAQ remains an existing client experience because it coordinates open questions and dismissal. Small `Reveal` client wrappers still accept server-rendered content as children; they do not make the enclosing shell a client component.
- Chain-directory data is passed only to a directory page, not every documentation, company, or legal page.
- `components/home-page.tsx` already renders on the server.
- `commercial-page.tsx` renders the product, methodology, and pricing pages on the server, with dedicated compact content layouts. The homepage's `release-review-preview.tsx` is a static explanation of deliverables, not a simulated customer workspace. The obsolete interactive upgrade demo and its styles have been removed.
- The older developer console is not imported by the live `/account` route; splitting that dormant file is not a live bundle optimization.

## Why the root remains dynamic

`proxy.ts` issues a request-specific CSP nonce. `app/layout.tsx` uses request-bound rendering so hydration scripts can match that nonce. Removing `force-dynamic`, caching HTML across requests, or using `ssr: false` to bypass rendering is not a safe performance shortcut.

Caching public HTML as a static artifact requires a separately reviewed CSP/cache design and rendered-script evidence. Moving presentation into a server component does not grant permission to cache nonce-bearing HTML. Keep authenticated, order, payment, and capability-bearing responses private and `no-store`. Do not strip nonce, origin, authorization, or anti-abuse controls to improve a build statistic.

## Interaction ownership

| Client module | Browser responsibility |
| --- | --- |
| `detail-status-experience.tsx` | Status fetch, request cancellation, current-status rendering |
| `detail-directory-experience.tsx` | Catalog fetch, search and family filters |
| `detail-gas-calculator.tsx` | Numeric input, estimate request and field errors |
| `detail-contact-experience.tsx` | Submission variants, form state, anti-abuse proof, idempotency and focus |
| `detail-newsletter-experience.tsx` | Consent, anti-abuse proof and subscription form state |
| `detail-ai-previews.tsx` | Selection within existing labelled illustrative previews |

`SubmissionFormVariant` is exported as a type from the contact client module.
The server shell imports that type only for selecting the appropriate form.
The contract import in the form is also type-only; it does not load backend
database or payment code into the browser.

## Remaining extraction and evidence

A whitepaper print button can become a small client component while the
document itself moves to a server component. Documentation filtering and
press-kit copy controls can similarly be isolated further. These modules
retain their current behavior in this batch.

This extraction does not alter route metadata, canonical redirects, the root
layout, `proxy.ts`, nonce generation, response caching, or authenticated API
boundaries. Root HTML remains request-bound for CSP. Existing content stays
visible in initial HTML and does not depend on an intersection observer to
become readable.

Automated suites were not run at the owner's request. Compilation and targeted
lint are part of the combined release verification. Browser navigation,
keyboard interactions, CSP nonce/chunk behavior, and performance measurement
remain runtime evidence to collect before claiming those properties verified.
