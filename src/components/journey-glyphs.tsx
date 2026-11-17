/**
 * The handful of pictograms the journey screens speak in. Drawn on a 24-unit
 * grid in currentColor, so each takes the colour of whatever it sits on.
 */

type GlyphProps = { size?: number };

export function WalkGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="13.5" cy="4" r="2.2" />
      <path d="M10.2 8.3c.4-.6 1.1-1 1.9-1 .3 0 .6 0 .9.2l3.2 1.4c.4.2.7.5.9.9l1.4 3c.2.5 0 1.1-.5 1.3s-1.1 0-1.3-.5l-1.2-2.6-1.5-.6.9 4.3 2.4 2.6c.2.2.3.5.3.8V22a1 1 0 1 1-2 0v-3.2l-2.6-2.7-.9 3.7-2.2 3.4a1 1 0 0 1-1.7-1.1l2-3.1 1.6-7.1-1.4.7-1 2.8a1 1 0 0 1-1.9-.6l1.2-3.2c.1-.3.3-.5.5-.6l2.7-1.6Z" />
    </svg>
  );
}

export function BusGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4Zm-4.5 13c-.83 0-1.5-.67-1.5-1.5S6.67 12 7.5 12s1.5.67 1.5 1.5S8.33 15 7.5 15Zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5ZM18 10H6V6h12v4Z" />
    </svg>
  );
}

export function FlagGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h9.4a1 1 0 0 1 .9.6l.6 1.4H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-5.4a1 1 0 0 1-.9-.6l-.6-1.4H6v7a1 1 0 0 1-1 1Z" />
    </svg>
  );
}

/** A request-stop bell: the thing to press. */
export function BellGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11c0-3.07-1.64-5.64-4.5-6.32V4a2.5 2.5 0 0 0-5 0v.68C6.63 5.36 5 7.92 5 11v5l-1.7 1.7A1 1 0 0 0 4 19.4h16a1 1 0 0 0 .7-1.7L19 16Z" />
    </svg>
  );
}

export function ExitGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GoGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5 20 21l-8-4-8 4 8-18.5Z" />
    </svg>
  );
}

export function CloseGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function RecenterGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg className="glyph-chevron" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
