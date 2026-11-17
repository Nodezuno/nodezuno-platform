"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { DetailPageData } from "@/lib/site-data";
import styles from "./faq-experience.module.css";

export function FaqExperience({ page }: { page: DetailPageData }) {
  const questionsRef = useRef<HTMLDivElement>(null);
  const [audit, guarantee, ai, price] = page.capabilities;
  const [timing, privacy, fit] = page.workflow ?? [];
  const groups = [
    { id: "service", title: "The service", items: [fit, audit, guarantee] },
    { id: "pricing-and-timing", title: "Pricing and timing", items: [price, timing] },
    { id: "privacy-and-ai", title: "Privacy and AI", items: [privacy, ai] },
  ];

  useEffect(() => {
    const closeQuestions = () => {
      questionsRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((question) => { question.open = false; });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!questionsRef.current?.contains(event.target as Node)) closeQuestions();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const active = document.activeElement;
        const question = active instanceof Element ? active.closest("details[open]") : null;
        closeQuestions();
        question?.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <section className={styles.page} data-resource-page="faq" aria-labelledby="faq-page-title">
      <header className={styles.header}>
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>FAQ</span></nav>
        <span className={styles.eyebrow}>THE DETAILS, EXPLAINED</span>
        <h1 id="faq-page-title">Frequently asked questions.</h1>
        <p>What we review, what it costs, and what to expect.</p>
      </header>
      <div className={styles.layout}>
        <nav className={styles.contents} aria-label="FAQ topics">
          <span>ON THIS PAGE</span>
          {groups.map((group, index) => (
            <a href={`#faq-${group.id}`} key={group.id}>
              <small>0{index + 1}</small>{group.title}<span aria-hidden="true">↘</span>
            </a>
          ))}
        </nav>
        <div className={styles.questions} ref={questionsRef}>
          {groups.map((group, groupIndex) => (
            <section className={styles.group} id={`faq-${group.id}`} key={group.id} aria-labelledby={`faq-${group.id}-title`}>
              <h2 id={`faq-${group.id}-title`}><span>0{groupIndex + 1}</span>{group.title}</h2>
              {group.items.filter((item) => item !== undefined).map((item, index) => (
                <details key={item.title} name="nodezuno-faq" open={groupIndex === 0 && index === 0 ? true : undefined}
                  onToggle={(event) => {
                    const current = event.currentTarget;
                    if (current.open) questionsRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]")
                      .forEach((other) => { if (other !== current) other.open = false; });
                  }}>
                  <summary>{item.title}<i aria-hidden="true" /></summary>
                  <div className={styles.answer}><p>{item.description}</p></div>
                </details>
              ))}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
