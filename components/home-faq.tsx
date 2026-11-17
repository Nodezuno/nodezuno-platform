"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./home-page.module.css";

type FaqItem = {
  readonly question: string;
  readonly answer: string;
};

export function HomeFaq({ items }: { items: readonly FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!listRef.current?.contains(event.target as Node)) {
        setOpenIndex(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenIndex(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={styles.faqList} ref={listRef}>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `home-faq-panel-${index}`;
        const buttonId = `home-faq-button-${index}`;

        return (
          <div className={styles.faqItem} key={item.question}>
            <h3>
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                id={buttonId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.question}</strong>
                <i aria-hidden="true" />
              </button>
            </h3>
            {isOpen ? (
              <div
                aria-labelledby={buttonId}
                className={styles.faqAnswer}
                id={panelId}
                role="region"
              >
                <p>{item.answer}</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
