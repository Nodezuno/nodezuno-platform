"use client";

import { useState } from "react";

function formatCalculatorCurrency(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      })
    : value;
}

export function GasCalculatorExperience() {
  const [gasUnits, setGasUnits] = useState(21000);
  const [gwei, setGwei] = useState(2.5);
  const [assetPrice, setAssetPrice] = useState(3500);
  const [result, setResult] = useState<{
    wei: string;
    totalGwei: string;
    nativeAsset: string;
    fiatUsd: string;
    calculatedAt: string;
  } | null>(null);
  const [calculatorState, setCalculatorState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [calculatorError, setCalculatorError] = useState<string | null>(null);
  const [calculatorFields, setCalculatorFields] = useState<
    Record<string, string>
  >({});
  const nativeCost = (gasUnits * gwei) / 1_000_000_000;
  const fiatCost = nativeCost * assetPrice;

  async function calculate() {
    setCalculatorState("loading");
    setCalculatorError(null);
    setCalculatorFields({});
    try {
      const response = await fetch("/api/v1/gas-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gasUnits: String(gasUnits),
          gwei: String(gwei),
          assetPrice: String(assetPrice),
        }),
      });
      const body = (await response.json()) as {
        data?: typeof result;
        title?: string;
        detail?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok || !body.data) {
        setCalculatorFields(body.fields ?? {});
        throw new Error(body.detail ?? body.title ?? "Calculation failed.");
      }
      setResult(body.data);
      setCalculatorState("ready");
    } catch (error) {
      setCalculatorState("error");
      setCalculatorError(
        error instanceof Error ? error.message : "Calculation failed.",
      );
    }
  }

  return (
    <section className="special-module calculator-module">
      <div className="module-head">
        <div>
          <span className="section-kicker">Interactive calculator</span>
          <h2>Estimate the cost of an EVM transaction.</h2>
        </div>
        <span className="calc-formula">gas × gwei × asset price</span>
      </div>
      <div className="calculator-grid">
        <div className="calculator-inputs">
          <label>
            <span>Gas units</span>
            <input
              aria-describedby={
                calculatorFields.gasUnits ? "gas-units-error" : undefined
              }
              max="100000000"
              min="1"
              onChange={(event) => setGasUnits(Number(event.target.value))}
              step="1"
              type="number"
              value={gasUnits}
            />
            <small>21,000 for a standard native transfer</small>
            {calculatorFields.gasUnits ? (
              <small className="form-error" id="gas-units-error">
                {calculatorFields.gasUnits}
              </small>
            ) : null}
          </label>
          <label>
            <span>Gas price</span>
            <div className="input-suffix">
              <input
                aria-describedby={
                  calculatorFields.gwei ? "gas-price-error" : undefined
                }
                max="1000000"
                min="0"
                onChange={(event) => setGwei(Number(event.target.value))}
                step="0.1"
                type="number"
                value={gwei}
              />
              <strong>GWEI</strong>
            </div>
            {calculatorFields.gwei ? (
              <small className="form-error" id="gas-price-error">
                {calculatorFields.gwei}
              </small>
            ) : null}
          </label>
          <label>
            <span>Native asset price</span>
            <div className="input-prefix">
              <strong>$</strong>
              <input
                aria-describedby={
                  calculatorFields.assetPrice
                    ? "asset-price-error"
                    : undefined
                }
                max="100000000"
                min="0"
                onChange={(event) => setAssetPrice(Number(event.target.value))}
                step="1"
                type="number"
                value={assetPrice}
              />
            </div>
            <small>Enter the current market price manually</small>
            {calculatorFields.assetPrice ? (
              <small className="form-error" id="asset-price-error">
                {calculatorFields.assetPrice}
              </small>
            ) : null}
          </label>
          <button
            className="button button-solid"
            disabled={calculatorState === "loading"}
            onClick={calculate}
            type="button"
          >
            {calculatorState === "loading"
              ? "Calculating…"
              : "Calculate with backend"}
          </button>
          {calculatorError ? (
            <p className="form-error" role="alert">
              {calculatorError}
            </p>
          ) : null}
        </div>
        <div className="calculator-result">
          <span>
            {calculatorState === "ready"
              ? "Estimated network cost · server calculated"
              : "Local planning preview"}
          </span>
          <strong>
            $
            {result?.fiatUsd
              ? formatCalculatorCurrency(result.fiatUsd)
              : Number.isFinite(fiatCost)
                ? fiatCost.toFixed(4)
                : "0.0000"}
          </strong>
          <small>
            {result?.nativeAsset ??
              (Number.isFinite(nativeCost) ? nativeCost.toFixed(8) : "0")}{" "}
            native asset
          </small>
          <div>
            <span>
              <small>Wei</small>
              <strong>
                {result?.wei ??
                  (Number.isFinite(nativeCost)
                  ? Math.round(nativeCost * 1_000_000_000_000_000_000).toLocaleString()
                    : "0")}
              </strong>
            </span>
            <span>
              <small>Gwei total</small>
              <strong>
                {result?.totalGwei ??
                  (Number.isFinite(gasUnits * gwei)
                  ? (gasUnits * gwei).toLocaleString()
                    : "0")}
              </strong>
            </span>
          </div>
          <p>
            Planning estimate only. Actual cost depends on chain state, fee
            mechanics, calldata, and transaction execution.
          </p>
        </div>
      </div>
    </section>
  );
}
