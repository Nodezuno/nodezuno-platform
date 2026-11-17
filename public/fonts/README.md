# Nodezuno self-hosted type

Manrope variable (400 to 800) and Instrument Serif regular/italic are
self-hosted WOFF2 assets. Pages never contact Google Fonts at runtime.
Both families use the SIL Open Font License; the full notices are alongside
the binaries. Fonts were downloaded unmodified on 2026-10-06 from the official
Google Fonts distribution at `fonts.gstatic.com`.

Upstream projects and license sources:

- Manrope: https://github.com/google/fonts/tree/main/ofl/manrope
- Instrument Serif: https://github.com/google/fonts/tree/main/ofl/instrumentserif

Manrope includes Latin and Latin Extended subsets, selected with CSS Unicode
ranges. Instrument Serif is a Latin display accent, with a system serif
fallback for other characters. `font-display: swap` keeps text readable while
the fonts load. The primary Latin sans face is preloaded; display faces load
only when a page uses them.
