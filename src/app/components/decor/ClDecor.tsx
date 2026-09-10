export function ClBurst({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <polygon
        fill="currentColor"
        points="60,2 65.9,37.8 89,9.8 76.3,43.7 110.2,31 82.2,54 118,60 82.2,66 110.2,89 76.3,76.3 89,110.2 65.9,82.2 60,118 54,82.2 31,110.2 43.7,76.3 9.8,89 37.8,66 2,60 37.8,54 9.8,31 43.7,43.7 31,9.8 54,37.8"
      />
    </svg>
  );
}

export function ClArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 12h15M12 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L9.5 19.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
