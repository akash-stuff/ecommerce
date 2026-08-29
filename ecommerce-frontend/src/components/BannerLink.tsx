import { Link } from 'react-router-dom';

/**
 * Wraps banner content in whichever link it needs, or nothing at all.
 *
 * A banner's link is optional and may be internal or external, and the two are
 * not interchangeable: an external address through react-router's `Link`
 * produces a client-side navigation to a route that does not exist. An absent
 * link must render no anchor rather than an inert one, so keyboard users are
 * not given a tab stop that does nothing.
 *
 * The backend already rejects anything that is not http(s) or a site-relative
 * path, so `href` here is safe to render; `rel` is still set because that is
 * about the destination's window handle, not about the scheme.
 */
export function BannerLink({
  href,
  className,
  style,
  children,
}: {
  href: string | null;
  className?: string;
  /** The announcement strip's own colours and font, when it has been styled. */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}
