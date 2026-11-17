type ReviewArea = "code" | "state" | "authority" | "execution";

export function ReviewAreaIcon({ area, className }: { area: ReviewArea; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {area === "code" ? <><path d="M10 9l-6 7 6 7M22 9l6 7-6 7M18 6l-4 20" /></> : area === "state" ? <><ellipse cx="16" cy="8" rx="10" ry="4" /><path d="M6 8v16c0 2.2 4.5 4 10 4s10-1.8 10-4V8M6 16c0 2.2 4.5 4 10 4s10-1.8 10-4" /></> : area === "authority" ? <><path d="M16 3l11 5v8c0 6-6 11-11 13C11 27 5 22 5 16V8l11-5Z" /><path d="M11 16l4 4 7-8" /></> : <><path d="M6 7h12a7 7 0 0 1 0 14H7M11 16l-5 5 5 5" /><circle cx="6" cy="7" r="2" /></>}
    </svg>
  );
}
