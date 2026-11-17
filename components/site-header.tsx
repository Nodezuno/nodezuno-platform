"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { NavGroup } from "@/lib/site-data";
import { Brand } from "./brand";
import styles from "./site-header.module.css";

const directNavigation = [
  { label: "Release Review", href: "/product" },
  { label: "How It Works", href: "/methodology" },
  { label: "Pricing", href: "/pricing" },
] as const;

function groupId(label: string) {
  return label.toLowerCase().replaceAll(/\s+/g, "-");
}

function pathIsCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupIsCurrent(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => pathIsCurrent(pathname, item.href));
}

export function SiteHeader({ navigation }: { navigation: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <SiteHeaderNavigation
      key={pathname}
      navigation={navigation}
      pathname={pathname}
    />
  );
}

function SiteHeaderNavigation({
  navigation,
  pathname,
}: {
  navigation: NavGroup[];
  pathname: string;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const desktopTriggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const [desktopOpen, setDesktopOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);

  function closeAllMenus() {
    setDesktopOpen(null);
    setMobileOpen(false);
    setMobileSection(null);
  }

  function closeAllMenusAndRestoreFocus() {
    const activeTrigger = desktopOpen
      ? desktopTriggers.current[desktopOpen]
      : mobileOpen
        ? mobileTriggerRef.current
        : null;

    closeAllMenus();
    if (activeTrigger) requestAnimationFrame(() => activeTrigger.focus());
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const header = headerRef.current;
      const path = event.composedPath();
      if (!header || path.includes(header)) return;

      const activeTrigger = desktopOpen
        ? desktopTriggers.current[desktopOpen]
        : mobileOpen
          ? mobileTriggerRef.current
          : null;
      const dismissedWithBackdrop = path.some(
        (target) =>
          target instanceof Element &&
          target.classList.contains("navigation-dismiss"),
      );

      closeAllMenus();
      if (dismissedWithBackdrop && activeTrigger) {
        requestAnimationFrame(() => activeTrigger.focus());
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      const activeTrigger = desktopOpen
        ? desktopTriggers.current[desktopOpen]
        : mobileOpen
          ? mobileTriggerRef.current
          : null;

      closeAllMenus();
      if (activeTrigger) {
        event.preventDefault();
        requestAnimationFrame(() => activeTrigger.focus());
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [desktopOpen, mobileOpen]);

  useEffect(() => {
    const breakpoint = window.matchMedia("(max-width: 1050px)");
    const closeForViewportChange = () => closeAllMenus();
    breakpoint.addEventListener("change", closeForViewportChange);
    return () => breakpoint.removeEventListener("change", closeForViewportChange);
  }, []);

  useEffect(() => {
    const closeForNavigation = () => closeAllMenus();
    window.addEventListener("popstate", closeForNavigation);
    window.addEventListener("hashchange", closeForNavigation);
    return () => {
      window.removeEventListener("popstate", closeForNavigation);
      window.removeEventListener("hashchange", closeForNavigation);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const inertTargets = [
      document.querySelector<HTMLElement>(".announcement"),
      document.querySelector<HTMLElement>("main"),
      document.querySelector<HTMLElement>(".site-footer"),
    ].filter((element): element is HTMLElement => Boolean(element));
    const priorInert = inertTargets.map((element) => element.hasAttribute("inert"));

    document.body.style.overflow = "hidden";
    inertTargets.forEach((element) => element.setAttribute("inert", ""));
    const focusFrame = requestAnimationFrame(() => {
      mobilePanelRef.current
        ?.querySelector<HTMLButtonElement>(".mobile-panel-close")
        ?.focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      inertTargets.forEach((element, index) => {
        if (!priorInert[index]) element.removeAttribute("inert");
      });
    };
  }, [mobileOpen]);

  function trapMobileFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const panel = mobilePanelRef.current;
    if (!panel) return;
    const controls = [
      ...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {desktopOpen || mobileOpen ? (
        <button
          aria-label="Dismiss open navigation"
          className={"navigation-dismiss " + styles.dismiss + (mobileOpen ? " " + styles.mobileDismiss : "")}
          onClick={closeAllMenusAndRestoreFocus}
          tabIndex={-1}
          type="button"
        >
          <span aria-hidden="true" className="navigation-dismiss-target" />
        </button>
      ) : null}

      <header
        className={"site-header " + styles.header + (desktopOpen || mobileOpen ? " navigation-open" : "")}
        onBlurCapture={(event) => {
          if (!desktopOpen || mobileOpen) return;
          const destination = event.relatedTarget;
          if (!(destination instanceof Node) || !event.currentTarget.contains(destination)) {
            setDesktopOpen(null);
          }
        }}
        onClickCapture={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("a")) closeAllMenus();
        }}
        ref={headerRef}
      >
        <div className="nav-shell">
          <Link className="brand-link" href="/" aria-label="Nodezuno home">
            <Brand />
          </Link>

          <nav className="desktop-nav" aria-label="Primary navigation">
            {directNavigation.map((item) => (
              <Link
                aria-current={pathIsCurrent(pathname, item.href) ? "page" : undefined}
                className={
                  "nav-direct" +
                  (pathIsCurrent(pathname, item.href) ? " is-active" : "")
                }
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}

            {navigation.map((group) => {
              const id = groupId(group.label);
              const isOpen = desktopOpen === group.label;
              const isCurrentGroup = groupIsCurrent(pathname, group);

              return (
                <div className={"nav-menu" + (isOpen ? " is-open" : "")} key={group.label}>
                  <button
                    aria-controls={"nav-panel-" + id}
                    aria-current={isCurrentGroup ? "page" : undefined}
                    aria-expanded={isOpen}
                    className={"nav-trigger" + (isCurrentGroup ? " is-active" : "")}
                    id={"nav-trigger-" + id}
                    onClick={() => {
                      setDesktopOpen((current) =>
                        current === group.label ? null : group.label,
                      );
                      setMobileOpen(false);
                      setMobileSection(null);
                    }}
                    ref={(node) => {
                      desktopTriggers.current[group.label] = node;
                    }}
                    type="button"
                  >
                    {group.label}
                    <svg className="summary-chevron" aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
                      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                    </svg>
                  </button>

                  {isOpen ? (
                    <div
                      aria-labelledby={"nav-trigger-" + id}
                      className={"mega-panel mega-panel-compact " + styles.dropdown}
                      data-menu={id}
                      id={"nav-panel-" + id}
                      role="region"
                    >
                      <div className="mega-grid mega-grid-compact">
                        {group.items.map((item) => (
                          <Link
                            aria-current={pathname === item.href ? "page" : undefined}
                            className={
                              "mega-item" + (pathname === item.href ? " is-active" : "")
                            }
                            href={item.href}
                            key={item.href}
                          >
                            <span className="mega-item-title">{item.title}</span>
                            <span className={styles.menuDescription}>{item.description}</span>
                            <span aria-hidden="true" className={styles.itemArrow}>→</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="nav-actions">
            <Link
              aria-current={pathname === "/account" ? "page" : undefined}
              className={"nav-docs" + (pathname === "/account" ? " is-active" : "")}
              href="/account"
            >
              Client portal
              <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className="mobile-menu">
            <button
              aria-controls="mobile-navigation-panel"
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              className="mobile-menu-trigger"
              onClick={() => {
                setMobileOpen((current) => !current);
                setDesktopOpen(null);
                if (mobileOpen) setMobileSection(null);
              }}
              ref={mobileTriggerRef}
              type="button"
            >
              <span />
              <span />
            </button>

            {mobileOpen ? (
              <div
                aria-label="Primary navigation"
                aria-modal="true"
                className="mobile-panel"
                id="mobile-navigation-panel"
                onKeyDown={trapMobileFocus}
                ref={mobilePanelRef}
                role="dialog"
              >
                <button
                  className="mobile-panel-close"
                  onClick={closeAllMenusAndRestoreFocus}
                  type="button"
                >
                  Close navigation <span aria-hidden="true">×</span>
                </button>

                {directNavigation.map((item) => (
                  <Link
                    aria-current={pathIsCurrent(pathname, item.href) ? "page" : undefined}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}

                {navigation.map((group) => {
                  const id = groupId(group.label);
                  const isOpen = mobileSection === group.label;
                  const isCurrentGroup = groupIsCurrent(pathname, group);

                  return (
                    <div className="mobile-disclosure" key={group.label}>
                      <button
                        aria-controls={"mobile-panel-" + id}
                        aria-current={isCurrentGroup ? "page" : undefined}
                        aria-expanded={isOpen}
                        className={
                          "mobile-disclosure-trigger" +
                          (isCurrentGroup ? " is-active" : "")
                        }
                        id={"mobile-trigger-" + id}
                        onClick={() =>
                          setMobileSection((current) =>
                            current === group.label ? null : group.label,
                          )
                        }
                        type="button"
                      >
                        {group.label}
                        <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                      </button>

                      {isOpen ? (
                        <div
                          aria-labelledby={"mobile-trigger-" + id}
                          className="mobile-group"
                          id={"mobile-panel-" + id}
                          role="region"
                        >
                          <div className="mobile-group-links">
                            {group.items.map((item) => (
                              <Link
                                aria-current={pathname === item.href ? "page" : undefined}
                                href={item.href}
                                key={item.href}
                              >
                                <span>{item.title}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <Link
                  aria-current={pathname === "/account" ? "page" : undefined}
                  href="/account"
                >
                  Client portal
                  <span aria-hidden="true">↗</span>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}
