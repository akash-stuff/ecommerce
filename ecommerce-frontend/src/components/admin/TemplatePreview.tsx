/**
 * A template drawn as the homepage it actually produces.
 *
 * Three colour swatches and a font name do not tell a shopkeeper what they are
 * choosing. What distinguishes these templates is the *order and presence* of
 * homepage sections — grocery leads with categories and has no hero, a jeweller
 * has a hero and almost nothing else — so the miniature renders exactly those
 * sections, in the stored order, using the template's own colours and heading
 * face.
 *
 * It is a diagram, not a screenshot: no real products, no real copy. A preview
 * that looks like a finished page invites the belief that the store will arrive
 * pre-filled, which it will not.
 */

export interface TemplateLook {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
}

export const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero banner',
  featured: 'Featured products',
  categories: 'Category grid',
  newArrivals: 'New arrivals',
  newsletter: 'Newsletter signup',
};

export function TemplatePreview({
  name,
  theme,
  sections,
  previewImage,
  className = '',
}: {
  name: string;
  theme?: TemplateLook | null;
  sections?: string[];
  /** An uploaded thumbnail wins: someone chose it over the generated diagram. */
  previewImage?: string | null;
  className?: string;
}) {
  if (previewImage) {
    return (
      <img
        src={previewImage}
        alt={`${name} preview`}
        className={`h-full w-full bg-ink-50 object-cover ${className}`}
      />
    );
  }

  const primary = theme?.primaryColor ?? '#111827';
  const secondary = theme?.secondaryColor ?? '#9CA3AF';
  const accent = theme?.accentColor ?? primary;
  const heading = theme?.headingFont ?? 'Inter';

  // A template with no sections stored still has a header and a footer, so the
  // frame is drawn regardless and only the body is empty.
  const body = sections?.length ? sections : [];

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden bg-white ${className}`}
      aria-label={`${name} layout preview`}
      role="img"
    >
      {/* Header: wordmark in the heading face, and the three things every
          storefront header has, so the miniature is recognisable as one. */}
      <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-2.5 py-1.5">
        <span
          className="max-w-[60%] truncate text-[8px] font-semibold leading-none"
          style={{ color: primary, fontFamily: `'${heading}', Georgia, serif` }}
        >
          {name}
        </span>
        <span className="flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[3px] w-2.5 rounded-full" style={{ background: secondary, opacity: 0.45 }} />
          ))}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 p-1.5">
        {body.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[7px] uppercase tracking-wider text-ink-300">No sections</span>
          </div>
        )}

        {body.map((section) => (
          <Section
            key={section}
            section={section}
            primary={primary}
            secondary={secondary}
            accent={accent}
            heading={heading}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-black/5 px-2.5 py-1">
        <span className="block h-[3px] w-8 rounded-full" style={{ background: secondary, opacity: 0.4 }} />
      </div>
    </div>
  );
}

function Section({
  section,
  primary,
  secondary,
  accent,
  heading,
}: {
  section: string;
  primary: string;
  secondary: string;
  accent: string;
  heading: string;
}) {
  switch (section) {
    // The hero is the only section that takes the primary colour as a fill, and
    // the only one allowed to grow — it is what "above the fold" means here.
    case 'hero':
      return (
        <div
          className="flex min-h-[26px] flex-[1.4] flex-col justify-center gap-1 rounded px-2"
          style={{ background: primary }}
        >
          <span
            className="text-[7px] font-medium leading-none text-white/95"
            style={{ fontFamily: `'${heading}', Georgia, serif` }}
          >
            Headline
          </span>
          <span className="h-[4px] w-6 rounded-sm" style={{ background: accent, opacity: 0.9 }} />
        </div>
      );

    case 'featured':
      return <Grid count={4} accent={accent} secondary={secondary} label="Featured" />;

    case 'newArrivals':
      return <Grid count={3} accent={accent} secondary={secondary} label="New in" />;

    case 'categories':
      return (
        <div className="flex flex-1 gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-1 items-end rounded p-1"
              style={{ background: secondary, opacity: 0.28 - i * 0.04 }}
            >
              <span className="h-[3px] w-3/5 rounded-full bg-white/70" />
            </div>
          ))}
        </div>
      );

    case 'newsletter':
      return (
        <div
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1"
          style={{ background: secondary, opacity: 0.22 }}
        >
          <span className="h-[5px] flex-1 rounded-sm bg-white/80" />
          <span className="h-[5px] w-4 rounded-sm" style={{ background: primary }} />
        </div>
      );

    default:
      return null;
  }
}

function Grid({
  count,
  accent,
  secondary,
  label,
}: {
  count: number;
  accent: string;
  secondary: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-[3px]">
      <span className="text-[6px] uppercase tracking-wider" style={{ color: secondary }}>
        {label}
      </span>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col gap-[2px]">
            <div className="flex-1 rounded-sm bg-ink-100" />
            <span className="h-[2px] w-2/3 rounded-full" style={{ background: secondary, opacity: 0.5 }} />
            <span className="h-[2px] w-1/3 rounded-full" style={{ background: accent }} />
          </div>
        ))}
      </div>
    </div>
  );
}
