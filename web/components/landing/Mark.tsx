/** The Reachable hexagon mark. Lucide-family geometry, stroke 1.75 always. */
export function Mark({ size = 18, color = 'var(--sig)', detail = true }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path d="M9 1.6 15.6 5v8L9 16.4 2.4 13V5z" />
      {detail && <path d="M9 6.2v5.6M6.2 7.6v2.8M11.8 7.6v2.8" />}
    </svg>
  );
}

export function ArrowRight({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
