"use client";

import { useEffect, useMemo, useState } from "react";

export function ChainDirectoryExperience({
  initialChains,
}: {
  initialChains: typeof import("@/lib/site-data").chainDirectory;
}) {
  type ChainRecord = {
    slug: string;
    name: string;
    family: string;
    finality: string;
    stage: string;
    tone: string;
    verifiedAt: number | null;
  };
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All");
  const [backendChains, setBackendChains] = useState<ChainRecord[] | null>(null);
  const [catalogState, setCatalogState] = useState<
    "loading" | "ready" | "fallback"
  >("loading");
  const families = ["All", "EVM", "EVM L2", "SVM", "UTXO"];
  const chains =
    backendChains ??
    initialChains.map((chain) => ({
      slug: chain.name.toLowerCase().replaceAll(" ", "-"),
      name: chain.name,
      family: chain.family,
      finality: chain.finality,
      stage: "planned",
      tone: chain.tone,
      verifiedAt: null,
    }));

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/chains", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog unavailable");
        const body = (await response.json()) as {
          data: { chains: ChainRecord[] };
        };
        setBackendChains(body.data.chains);
        setCatalogState("ready");
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCatalogState("fallback");
        }
      });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(
    () =>
      chains.filter(
        (chain) =>
          (family === "All" || chain.family === family) &&
          chain.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [chains, family, query],
  );

  return (
    <section className="special-module directory-module">
      <div className="module-head">
        <div>
          <span className="section-kicker">Network explorer</span>
          <h2>Find the right execution environment.</h2>
        </div>
        <label className="directory-search">
          <span className="sr-only">Search chains</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search networks"
            type="search"
            value={query}
          />
          <span aria-hidden="true">⌕</span>
        </label>
      </div>
      <div className="directory-filters" aria-label="Filter by execution family">
        {families.map((item) => (
          <button
            className={family === item ? "active" : ""}
            key={item}
            onClick={() => setFamily(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      <div className="chain-table">
        <div className="chain-table-head">
          <span>Network</span>
          <span>Family</span>
          <span>Finality</span>
          <span>Platform stage</span>
        </div>
        {filtered.map((chain) => (
          <div className="chain-row" key={chain.name}>
            <div>
              <span className={`chain-dot chain-dot-${chain.tone}`}>
                {chain.name.slice(0, 2).toUpperCase()}
              </span>
              <strong>{chain.name}</strong>
            </div>
            <span>{chain.family}</span>
            <span>{chain.finality}</span>
            <small className={chain.stage === "full" ? "stage-full" : ""}>
              {chain.stage.replaceAll("_", " ")}
            </small>
          </div>
        ))}
        {filtered.length === 0 ? (
          <div className="directory-empty">No networks match that filter.</div>
        ) : null}
      </div>
      <p className="module-disclaimer">
        {catalogState === "ready"
          ? "Backend-backed catalog. Planned and preview stages are not claims of live endpoint availability."
          : catalogState === "fallback"
            ? "The live catalog is temporarily unavailable; showing a conservative planned fallback."
            : "Loading the backend-backed chain catalog."}
      </p>
    </section>
  );
}
