# Landing page images

Four photographs, all present. The page asks for each by path at runtime and
falls back to a labelled placeholder if one goes missing, so a rename here shows
up as an outlined panel on the page rather than a broken image.

| File | Where | Size | Subject |
|---|---|---|---|
| `hero.jpg` | Beside the headline | 1600 × 897 | The console open on a laptop, on a green desk |
| `devices.jpg` | "Every Store, Entirely Its Own", left | 1200 × 800 | One storefront on a laptop and a phone |
| `storefront.jpg` | Same section, right | 1440 × 960 | A storefront's own front page |
| `brand.jpg` | The dark green band | 1560 × 790 | Branded carrier bag, shipping box and trolley |
| `signin.jpg` | The sign-in page's left panel | 900 × 1200 | The brand poster — mark, wordmark and packaging |

`signin.jpg` is a supplied poster used whole; the other four were cropped out of larger supplied compositions — the originals were
full page designs with their own headlines and buttons in them, which would have
put a second landing page inside this one. What is here is the photography with
that artwork cropped away. `scratchpad/crop.ps1` in the session that made them
records the exact rectangles if they need recutting.

## Replacing one

Keep the filename and the rough proportions and nothing else needs touching —
the slot crops to fit with `object-cover`, anchored to the top, so a slightly
different shape loses its edges rather than stretching. To change the shape
itself, update `SHOTS` in `src/pages/platform/Landing.tsx`; the `width` and
`height` there are what reserve the space before the image loads, so they have
to match the file or the page will jump as it arrives.

JPEG, not PNG: these are photographs, and the five together are about 700 KB as
JPEG against roughly 10 MB as PNG. Keep new ones under ~250 KB.

`signin.jpg` fills a tall panel with `object-cover` and already carries the mark,
the wordmark and the tagline — which is why the sign-in page prints none of
those itself. A replacement that does not carry them will leave that panel
unbranded.

## Anything here is public

Files in this directory are served at `/marketing/<name>` with no login in front
of them. Do not use a screenshot showing a real store's real customers, real
order values, or anything else out of a live database.
