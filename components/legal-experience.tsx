import Link from "next/link";

const policyLinks = [
  {
    href: "/legal/terms",
    index: "01",
    title: "Website terms",
    body: "Rules for using the public website, review intake, examples, and account features.",
  },
  {
    href: "/legal/privacy",
    index: "02",
    title: "Privacy summary",
    body: "What the website stores, why it is used, how long it remains, and how to request control.",
  },
  {
    href: "/legal/acceptable-use",
    index: "03",
    title: "Acceptable use",
    body: "Boundaries that protect people, the website, external networks, and responsible research.",
  },
  {
    href: "/security",
    index: "04",
    title: "Security architecture",
    body: "Implemented website controls, proposed product principles, and responsible-disclosure routing.",
  },
];

function LegalHeader({ title }: { title: string }) {
  return (
    <div className="legal-document-head">
      <div>
        <span>OPERATIONAL POLICY / WEBSITE</span>
        <h2>{title}</h2>
      </div>
      <div>
        <span>Effective</span>
        <strong>10 August 2026</strong>
        <small>Version 0.1 · English</small>
      </div>
    </div>
  );
}

function LegalDisclaimer() {
  return (
    <div className="legal-review-notice">
      <strong>Counsel review required before public commercial launch.</strong>
      <p>
        Nodezuno is a trade name used by Sanjay Sudagani, a sole proprietor.
        This page is a good-faith operational description, not legal advice or
        a binding services agreement. Governing law, venue, service address,
        tax and invoice treatment, cross-border payment rules, and final terms
        still require review by qualified counsel.
      </p>
    </div>
  );
}

function LegalCenter() {
  return (
    <section className="legal-module">
      <LegalHeader title="Legal center" />
      <LegalDisclaimer />
      <div className="legal-policy-grid">
        {policyLinks.map((policy) => (
          <Link href={policy.href} key={policy.href}>
            <span>{policy.index}</span>
            <h3>{policy.title}</h3>
            <p>{policy.body}</p>
            <i aria-hidden="true">↗</i>
          </Link>
        ))}
      </div>
      <div className="legal-facts">
        <div>
          <span>Seller</span>
          <p>
            Sanjay Sudagani, sole proprietor trading as Nodezuno. Nodezuno is a
            trade name and is not represented here as an incorporated company.
          </p>
        </div>
        <div>
          <span>Current service scope</span>
          <p>
            Public product information, EVM and non-EVM blockchain
            release review intake, accounts, protected request history, consent
            records, administrator review of submitted requests, fixed $7,500
            proposals, direct Ethereum payment instructions, and onchain
            verification for accepted review orders.
          </p>
        </div>
        <div>
          <span>Not a current service</span>
          <p>
            Custody, transaction execution, signing, production deployment,
            legal advice, formal verification, or a guarantee that every
            vulnerability will be found.
          </p>
        </div>
        <div>
          <span>Policy contact</span>
          <p>
            Use <a href="mailto:info@nodezuno.com">info@nodezuno.com</a> for
            legal questions and{" "}
            <a href="mailto:info@nodezuno.com">info@nodezuno.com</a> for
            privacy enquiries.
          </p>
        </div>
      </div>
    </section>
  );
}

function PrivacyDocument() {
  return (
    <section className="legal-module legal-document">
      <LegalHeader title="Website privacy summary" />
      <LegalDisclaimer />
      <div className="legal-document-body">
        <section>
          <span>01</span>
          <div>
            <h3>Scope and roles</h3>
            <p>
              This summary covers data handled by Nodezuno.com. Sanjay Sudagani,
              sole proprietor trading as Nodezuno, operates the service. A
              service address, applicable jurisdiction, privacy rights, and
              any required representative details must be completed before a
              public commercial launch. Private review artifacts require a
              separately agreed restricted channel and are not accepted
              through the public intake form.
            </p>
          </div>
        </section>
        <section>
          <span>02</span>
          <div>
            <h3>Data collected</h3>
            <p>
              Intake forms store name, work email, company, team type, message,
              request category, source path, bounded campaign attribution,
              consent version and time, authenticated submitter email when
              present, status, and timestamps. Newsletter intake stores email,
              optional name, consent, state, source path, and a hash of a
              private suppression token.
            </p>
            <p>
              Account records store a name, email or private synthetic wallet
              identifier, verification state, linked provider identifiers, a
              one-way password verifier for email accounts, encrypted OAuth
              tokens when Google is configured, and session records with
              expiry, IP address, and user-agent metadata. Wallet sign-in stores
              the connected EVM or Solana public address and network identity.
              Nodezuno never asks for or stores a wallet private key or seed
              phrase.
            </p>
            <p>
              Smart contract and protocol release review records store the application, status
              history, and private-access verifier. When an accepted EVM or selected
              non-EVM order enters the fixed $7,500 commercial flow, its records
              also store the proposal, accepted terms, fixed obligation, selected
              stablecoin, official token contract, exact server-issued amount,
              recipient address, transaction hash, mandatory Telegram username,
              confirmation state, verification evidence, and any manual refund
              reference. Ethereum addresses, token transfers, and transaction
              hashes are public blockchain data. Nodezuno does not ask for or store
              a payment private key, seed phrase, token approval, or wallet signing
              credential.
            </p>
            <p>
              A host-only, HttpOnly, SameSite=Lax cookie carries the opaque
              session credential. It becomes Secure on HTTPS and expires with
              the account session. The application does not use advertising or
              cross-site tracking cookies.
            </p>
            <p>
              Form-abuse controls store daily HMAC fingerprints derived from IP
              and user agent instead of storing a second raw copy. Account
              sessions separately retain the IP address and user-agent metadata
              described above. Infrastructure providers may also process
              network metadata in their necessary service logs.
            </p>
          </div>
        </section>
        <section>
          <span>03</span>
          <div>
            <h3>Purpose and basis</h3>
            <p>
              Data is used to respond to a requested conversation, review
              respond to a requested conversation or release-review order,
              handle a responsible-disclosure contact, administer account and
              order history, authenticate accounts, preserve consent, process
              payment claims, contact a buyer about a submitted transaction,
              suppress newsletter delivery, prevent abuse, maintain security,
              and demonstrate administrative accountability.
            </p>
          </div>
        </section>
        <section>
          <span>04</span>
          <div>
            <h3>Storage, recipients, and transfers</h3>
            <p>
              Website records are stored in the database selected for the
              deployment: operator-managed SQLite or a separately reviewed
              compatible profile. They are available only through public
              receipt paths, stable account-ID-scoped request history, or
              trusted administrator identity plus a server-side allowlist.
              Better Auth manages customer credentials, provider links, wallet
              links, and sessions in the same database. The application
              session or verified hosting identity and the administrator
              allowlist form the administrator boundary.
              Google receives the information required for OpenID Connect only
              when that provider is configured and selected. When Zoho email
              delivery is configured, Zoho receives the sender, destination,
              message content, and necessary authentication, private review,
              or newsletter links. No advertising network or application
              analytics tracker is configured in this repository.
            </p>
            <p>
              Review, operator, and newsletter notices use a durable
              notification outbox. The worker sends through Zoho SMTP only
              after both required settings are installed. SMTP acceptance is
              recorded, but the application receives no delivery or failure
              callback. When delivery is disabled, queued notices are not sent
              to an external provider.
            </p>
            <p>
              Direct payment uses no payment processor or hosted checkout. If
              the owner approves launch and enables payment instructions, the
              private portal displays a server-issued instruction for official
              USDC or USDT on Ethereum Mainnet. In the Cloudflare profile,
              Nodezuno manually checks the submitted transaction using public
              blockchain information and records an operator decision.
              Etherscan is an optional public viewer, not Nodezuno's payment
              authority. Optional payment-verification providers may process
              ordinary network metadata under their own terms.
            </p>
          </div>
        </section>
        <section>
          <span>05</span>
          <div>
            <h3>Retention and deletion</h3>
            <p>
              Website submissions carry a maximum two-year expiry, disappear
              from request and admin views after expiry, and are removed during
              backend maintenance. Expired rate-limit windows are removed.
              Customer sessions expire logically after seven days. Account,
              provider, wallet, newsletter, and audit records do not yet have a
              repository-owned self-service erasure workflow or complete
              formal retention schedule. Public
              blockchain records cannot be deleted by Nodezuno. Those controls
              and distinctions must be documented before public commercial
              launch.
            </p>
          </div>
        </section>
        <section>
          <span>06</span>
          <div>
            <h3>Your choices</h3>
            <p>
              Use the private unsubscribe link in the newsletter confirmation
              email to suppress the address. For access, correction, deletion,
              restriction, objection, or an explanation, contact{" "}
              <a href="mailto:info@nodezuno.com">info@nodezuno.com</a>.
              Identity and legal obligations must be verified before acting on
              a request.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

function TermsDocument() {
  return (
    <section className="legal-module legal-document">
      <LegalHeader title="Website terms summary" />
      <LegalDisclaimer />
      <div className="legal-document-body">
        {[
          [
            "Website scope",
            "The website provides product information, direct smart contract and protocol release review service orders for supported EVM and non-EVM ecosystems, consent records, account features, protected order history, and related administrative controls. Every service order uses the same fixed $7,500 price and Ethereum Mainnet USDC or USDT payment flow. The website does not itself provide an audit opinion, custody, transaction execution, signing, legal advice, or production deployment access.",
          ],
          [
            "Fixed service order and agreement",
            "Submitting the form creates a versioned fixed service order from the supplied details. The smart contract or protocol release review becomes active only after the buyer accepts that service order and the applicable service terms, then Sanjay manually checks and records the scheduling deposit. The service order and terms define the reviewed code and files, chain-specific method, timing, confidentiality, deliverables, payment, cancellation, refund treatment, reliance, and liability with Sanjay Sudagani, sole proprietor trading as Nodezuno. The current public checklist and whitepaper describe the standard EVM method. Website examples and whitepaper material are informational.",
          ],
          [
            "Your submissions",
            "You must have authority to provide the information, keep it accurate, and avoid private keys, credentials, exploit payloads, regulated records, customer secrets, or unnecessary personal data. Public forms are not a restricted evidence channel.",
          ],
          [
            "Responsible use",
            "Do not bypass access control, evade limits, automate abusive traffic, interfere with services, test third-party systems, scrape protected data, introduce malware, impersonate others, or use the website unlawfully.",
          ],
          [
            "Intellectual property",
            "The Nodezuno name, marks, site design, research, and original content remain with their respective owner. The press-kit files may be used accurately for editorial reference without alteration or implied endorsement.",
          ],
          [
            "Availability and change",
            "Website content may change, move, or be withdrawn. The website is provided without a commercial uptime or support commitment. An unpaid service order does not start work. In the current Cloudflare deployment, work starts only after the applicable service terms are accepted and Sanjay manually checks and records the scheduling payment.",
          ],
          [
            "Direct stablecoin settlement",
            "Payment instructions are issued only inside an authorized review portal after the buyer accepts the fixed service order and service terms. Send only the exact server-issued amount of official USDC or USDT on Ethereum Mainnet to the displayed recipient. The buyer submits the transaction hash and Telegram username. In the current Cloudflare deployment, Sanjay checks the token, recipient, amount, and transaction status manually before recording payment. A transaction hash, screenshot, Telegram message, or block-explorer page alone does not prove payment. Automatic payment verification is off.",
          ],
          [
            "Refund and compliance boundary",
            "Blockchain transfers cannot be cancelled by Nodezuno. Any refund allowed by signed terms is reviewed and sent manually from an externally controlled wallet after identity, transaction, sanctions, tax, accounting, and security checks. Direct settlement does not remove GST, income-tax, invoicing, foreign-exchange, FEMA, sanctions, recordkeeping, licensing, or other legal duties that may apply. India-qualified and destination-jurisdiction advice is required before commercial launch.",
          ],
        ].map(([title, body], index) => (
          <section key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function AcceptableUseDocument() {
  return (
    <section className="legal-module legal-document">
      <LegalHeader title="Acceptable-use summary" />
      <LegalDisclaimer />
      <div className="legal-document-body">
        {[
          ["Authorization", "Access only public content and protected resources assigned to your authenticated account or administrator identity. Do not probe another user, administrator route, database, Worker, storage binding, deployment, or infrastructure account."],
          ["Traffic", "Do not overload, flood, recurse, scrape aggressively, evade proof-of-work or rate limits, create artificial submissions, or interfere with normal availability."],
          ["Security research", "Use the responsible-disclosure page first. Avoid denial of service, destructive testing, persistence, social engineering, physical attacks, privacy violations, customer data, and access beyond the minimum proof."],
          ["Sensitive data", "Never submit seed phrases, private keys, authentication tokens, credentials, exploit code, malware, regulated records, payment-card data, health data, or unnecessary third-party personal information."],
          ["External networks", "Do not use Nodezuno.com to target, disrupt, impersonate, exploit, or make unauthorized transactions against a blockchain, provider, protocol, contract, person, or organization."],
          ["Enforcement", "Nodezuno may reject, suppress, rate-limit, preserve evidence of, or investigate activity that appears unsafe or abusive. Material incidents may be reported where legally required."],
        ].map(([title, body], index) => (
          <section key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="legal-emergency">
        <span>Security contact</span>
        <p>
          Start with a high-level report. Wait for a restricted evidence
          channel before sharing sensitive reproduction material.
        </p>
        <Link href="/security/responsible-disclosure">Open disclosure intake ↗</Link>
      </div>
    </section>
  );
}

export function LegalExperience({ path }: { path: string }) {
  if (path === "legal/privacy") return <PrivacyDocument />;
  if (path === "legal/terms") return <TermsDocument />;
  if (path === "legal/acceptable-use") return <AcceptableUseDocument />;
  return <LegalCenter />;
}
