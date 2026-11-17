"use client";

import { useEffect, useRef } from "react";

export function AmbientPointer() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    const forcedColors = window.matchMedia("(forced-colors: active)");

    let frame = 0;
    let listening = false;
    const onPointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--pointer-x", `${event.clientX}px`);
        root.style.setProperty("--pointer-y", `${event.clientY}px`);
      });
    };
    const updateListener = () => {
      const shouldListen =
        finePointer.matches && !reduced.matches && !forcedColors.matches;
      if (shouldListen === listening) return;
      listening = shouldListen;
      if (shouldListen) {
        window.addEventListener("pointermove", onPointerMove, {
          passive: true,
        });
        return;
      }
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      root.style.removeProperty("--pointer-x");
      root.style.removeProperty("--pointer-y");
    };

    updateListener();
    reduced.addEventListener("change", updateListener);
    finePointer.addEventListener("change", updateListener);
    forcedColors.addEventListener("change", updateListener);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      reduced.removeEventListener("change", updateListener);
      finePointer.removeEventListener("change", updateListener);
      forcedColors.removeEventListener("change", updateListener);
    };
  }, []);

  return <div className="ambient-pointer" aria-hidden="true" />;
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || !("IntersectionObserver" in window)) {
      node.dataset.visible = "true";
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.dataset.visible = "true";
          observer.unobserve(node);
        }
      },
      // A long section may never occupy a fixed percentage of the viewport.
      { threshold: 0, rootMargin: "0px 0px -24px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
