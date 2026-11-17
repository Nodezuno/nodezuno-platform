import Link from "next/link";
import styles from "./release-path-visual.module.css";

/** A conceptual map of the service, not a simulated customer dashboard. */
export function ReleasePathVisual() {
  return (
    <figure className={styles.visual} aria-labelledby="release-path-caption">
      <div className={styles.canvas}>
        <div className={styles.topline}><span>THE CHANGE BETWEEN VERSIONS</span><span>01 → 02</span></div>
        <svg className={styles.diagram} viewBox="0 0 560 380" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="release-path-line" x1="70" y1="190" x2="490" y2="190" gradientUnits="userSpaceOnUse"><stop stopColor="#597a59" /><stop offset=".5" stopColor="#ceef93" /><stop offset="1" stopColor="#597a59" /></linearGradient>
            <radialGradient id="release-path-halo"><stop stopColor="#acd974" stopOpacity=".18" /><stop offset="1" stopColor="#acd974" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx="280" cy="190" r="175" fill="url(#release-path-halo)" />
          <g stroke="#7d9f7b" strokeOpacity=".16"><circle cx="280" cy="190" r="72" /><circle cx="280" cy="190" r="112" /><circle cx="280" cy="190" r="150" /><path d="M280 16v348M105 190h350" /><path d="M174 84l212 212M174 296L386 84" /></g>
          <g stroke="url(#release-path-line)" strokeWidth="1.5"><path d="M78 190h127M355 190h127" /><path d="M280 112V74h-76M280 268v38h76" /><path d="M280 112V74h76M280 268v38h-76" /></g>
          <path className={styles.trace} d="M78 190h404" stroke="#d6ff97" strokeWidth="2" strokeDasharray="28 376" />
          <g fill="#10261b" stroke="#79956d"><rect x="40" y="151" width="76" height="78" rx="10" /><rect x="444" y="151" width="76" height="78" rx="10" /></g>
          <g stroke="#c1d1b7" strokeWidth="1.4" strokeLinecap="round"><path d="M60 174h25M60 185h36M60 196h36M60 207h20" /><path d="M465 174h25M465 185h34M465 196h34M465 207h19" /></g>
          <path d="M87 204l5 5 10-11" stroke="#c6f98c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <g fill="#c6ef99"><circle cx="204" cy="74" r="3" /><circle cx="356" cy="74" r="3" /><circle cx="204" cy="306" r="3" /><circle cx="356" cy="306" r="3" /></g>
          <rect x="223" y="133" width="114" height="114" rx="25" fill="#183720" stroke="#97be7b" />
          <rect x="230" y="140" width="100" height="100" rx="20" stroke="#a6cc86" strokeOpacity=".15" />
          <g stroke="#d0ff91" strokeWidth="2.4" strokeLinecap="round"><path d="M254 164l52 52M306 164l-52 52" /><path d="M254 164v13M306 164v13M254 216v-13M306 216v-13" /><circle cx="254" cy="164" r="7" fill="#183720" /><circle cx="306" cy="164" r="7" fill="#183720" /><circle cx="254" cy="216" r="7" fill="#183720" /><circle cx="306" cy="216" r="7" fill="#183720" /></g>
        </svg>
        <ul className={styles.checks} aria-label="Review areas">
          <li>Code</li><li>State</li><li>Authority</li><li>Execution</li>
        </ul>
        <div className={styles.stages}><div><span>01 / BASELINE</span><strong>Previously reviewed</strong></div><div><span>NODEZUNO</span><strong>Investigate the change</strong></div><div><span>02 / CANDIDATE</span><strong>Your next release</strong></div></div>
      </div>
      <figcaption id="release-path-caption"><span>New version. New evidence.</span><Link href="/methodology">Explore the review method <span aria-hidden="true">↗</span></Link></figcaption>
    </figure>
  );
}
