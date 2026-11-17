import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  ambient: new URL("../components/client-effects.tsx", import.meta.url),
  appManifest: new URL("../app/manifest.ts", import.meta.url),
  catchAll: new URL("../app/[...slug]/page.tsx", import.meta.url),
  detail: new URL("../components/detail-page.tsx", import.meta.url),
  header: new URL("../components/site-header.tsx", import.meta.url),
  home: new URL("../components/home-page.tsx", import.meta.url),
  homePage: new URL("../app/page.tsx", import.meta.url),
  layout: new URL("../app/layout.tsx", import.meta.url),
  manifest: new URL("../dist/client/.vite/manifest.json", import.meta.url),
  openGraph: new URL("../public/og.png", import.meta.url),
  pressKit: new URL("../components/press-kit-experience.tsx", import.meta.url),
  publicNavigation: new URL("../lib/public-navigation.ts", import.meta.url),
  styles: new URL("../app/globals.css", import.meta.url),
};

test("public client entries receive the focused catalog from server components", async () => {
  const [
    header,
    home,
    detail,
    layout,
    homePage,
    catchAll,
    publicNavigation,
    manifestSource,
  ] =
    await Promise.all([
      readFile(files.header, "utf8"),
      readFile(files.home, "utf8"),
      readFile(files.detail, "utf8"),
      readFile(files.layout, "utf8"),
      readFile(files.homePage, "utf8"),
      readFile(files.catchAll, "utf8"),
      readFile(files.publicNavigation, "utf8"),
      readFile(files.manifest, "utf8"),
  ]);

  assert.doesNotMatch(header, /import\s+\{\s*navigation\s*\}/);
  assert.doesNotMatch(header, /\/api\/v1\/auth\/session/);
  assert.match(header, /import \{ usePathname \} from "next\/navigation"/);
  assert.match(header, /const pathname = usePathname\(\)/);
  assert.match(
    header,
    /<SiteHeaderNavigation[\s\S]+key=\{pathname\}[\s\S]+navigation=\{navigation\}/,
  );
  assert.match(header, /navigation: NavGroup\[\]/);
  assert.match(header, /label: "Release Review", href: "\/product"/);
  assert.match(header, /label: "How It Works", href: "\/methodology"/);
  assert.match(header, /href=\{item\.href\}/);
  assert.doesNotMatch(header, /review\/start|Start a review/);
  assert.doesNotMatch(header, /href="\/(?:console|start)"/);

  assert.doesNotMatch(home, /import\s+\{[^}]*planeData/);
  assert.doesNotMatch(detail, /import\s+\{[^}]*chainDirectory/);
  assert.match(layout, /<SiteHeader navigation=\{navigation\}/);
  assert.match(homePage, /return <HomePage \/>/);
  assert.doesNotMatch(detail, /ssr:\s*false/);
  assert.match(
    catchAll,
    /<DetailPage initialChains=\{page\.kind === "directory" \? chainDirectory : \[\]\} page=\{page\}/,
  );
  assert.match(catchAll, /if \(page\.path !== path\)/);
  assert.match(catchAll, /permanentRedirect\(withSearchParams\(`\/\$\{page\.path\}`, query\)\)/);
  assert.match(publicNavigation, /"contact\/upgrade-assurance": "\/review\/start"/);
  assert.match(publicNavigation, /"community\/startup-program": "\/review\/start"/);
  assert.match(publicNavigation, /"contact\/chain-launch": "\/review\/start"/);

  const manifest = JSON.parse(manifestSource);
  assert.equal(
    Object.keys(manifest).some((key) => key.includes("site-data")),
    false,
    "the public site catalog must not become a client bundle",
  );

  for (const entryName of [
    "components/site-header.tsx",
    "components/review-start-experience.tsx",
    "components/review-order-experience.tsx",
  ]) {
    assert.ok(manifest[entryName], `${entryName} should remain a client entry`);
    assert.doesNotMatch(JSON.stringify(manifest[entryName]), /site-data/);
  }
});

test("pointer effects honor motion, input, and high-contrast preferences", async () => {
  const [ambient, styles] = await Promise.all([
    readFile(files.ambient, "utf8"),
    readFile(files.styles, "utf8"),
  ]);

  assert.match(ambient, /\(prefers-reduced-motion: reduce\)/);
  assert.match(ambient, /\(pointer: fine\)/);
  assert.match(ambient, /\(forced-colors: active\)/);
  assert.match(ambient, /addEventListener\("change", updateListener\)/);
  assert.match(ambient, /removeEventListener\("pointermove", onPointerMove\)/);

  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(styles, /@media \(forced-colors: active\)/);
  assert.match(
    styles,
    /\.mobile-disclosure-trigger\[aria-expanded="true"\]/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+?\.reveal \{[\s\S]+?opacity: 1;[\s\S]+?transform: none;/,
  );
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)[\s\S]+?\.console-notice button \{[\s\S]+?width: 44px;[\s\S]+?height: 44px;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 480px\)[\s\S]+?\.announcement a \{[\s\S]+?white-space: normal;/,
  );
});

test("navigation keeps one disclosure open and closes accessibly", async () => {
  const [header, styles] = await Promise.all([
    readFile(files.header, "utf8"),
    readFile(files.styles, "utf8"),
  ]);

  assert.match(
    header,
    /const \[desktopOpen, setDesktopOpen\] = useState<string \| null>\(null\)/,
  );
  assert.match(header, /const isOpen = desktopOpen === group\.label/);
  assert.match(
    header,
    /setDesktopOpen\(\(current\) =>\s*current === group\.label \? null : group\.label/,
  );
  assert.match(
    header,
    /document\.addEventListener\("pointerdown", handlePointerDown, true\)/,
  );
  assert.match(
    header,
    /if \(!header \|\| path\.includes\(header\)\) return;[\s\S]*closeAllMenus\(\)/,
  );
  assert.match(header, /onClickCapture=\{\(event\) => \{[\s\S]+target\.closest\("a"\)\) closeAllMenus\(\)/);
  assert.match(header, /onBlurCapture=\{\(event\) => \{[\s\S]+setDesktopOpen\(null\)/);
  assert.match(
    header,
    /const dismissedWithBackdrop = path\.some\([\s\S]+navigation-dismiss/,
  );
  assert.match(header, /key=\{pathname\}/);
  assert.match(
    header,
    /event\.key !== "Escape"[\s\S]+event\.preventDefault\(\)[\s\S]+activeTrigger\.focus\(\)/,
  );
  assert.match(
    header,
    /const isOpen = mobileSection === group\.label/,
  );
  assert.match(
    header,
    /setMobileSection\(\(current\) =>\s*current === group\.label \? null : group\.label/,
  );
  assert.match(header, /aria-modal="true"/);
  assert.match(header, /className="mobile-panel-close"/);
  assert.match(
    header,
    /aria-labelledby=\{"mobile-trigger-" \+ id\}[\s\S]+role="region"/,
  );
  assert.match(
    header,
    /aria-labelledby=\{"nav-trigger-" \+ id\}[\s\S]+role="region"/,
  );
  assert.match(header, /aria-current=\{isCurrentGroup \? "page" : undefined\}/);
  assert.match(header, /pathname === item\.href \? "page" : undefined/);
  assert.match(
    styles,
    /\.mobile-panel-close \{[\s\S]+min-width: 44px;[\s\S]+min-height: 44px;/,
  );
  assert.doesNotMatch(header, /useState<Set<string>>/);
});

test("media previews reserve space and the social image is delivery-sized", async () => {
  const [pressKit, layout, appManifest, image] = await Promise.all([
    readFile(files.pressKit, "utf8"),
    readFile(files.layout, "utf8"),
    readFile(files.appManifest, "utf8"),
    readFile(files.openGraph),
  ]);

  assert.match(pressKit, /loading="lazy"/);
  assert.match(pressKit, /decoding="async"/);
  assert.match(pressKit, /height=\{asset\.height\}/);
  assert.match(pressKit, /width=\{asset\.width\}/);
  assert.match(pressKit, /1200 × 630 PNG/);
  assert.match(layout, /width: 1200,[\s\S]+?height: 630,/);

  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(image.byteLength < 900_000);
  assert.match(
    appManifest,
    /src:\s*"\/nodezuno-mark\.svg"[\s\S]*sizes:\s*"any"/,
  );
  assert.match(
    appManifest,
    /src:\s*"\/favicon\.png"[\s\S]*sizes:\s*"128x128"/,
  );
  assert.doesNotMatch(
    appManifest,
    /favicon\.png"[\s\S]*sizes:\s*"512x512"/,
  );

  for (const source of [pressKit, layout, appManifest]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});
