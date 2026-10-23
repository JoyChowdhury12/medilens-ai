import { SVGProps } from 'react';

const P: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  chart: 'M4 19V5M4 19h16M8 15l3-4 3 3 5-7',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5h4',
  users: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM3 19.5c.4-3 2.8-5 6-5s5.6 2 6 5M16.5 5.3a3.1 3.1 0 0 1 0 5.8M18 14.8c1.7.6 2.8 2.2 3 4.7',
  upload: 'M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19.5h14',
  camera: 'M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  file: 'M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6',
  download: 'M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  alert: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.2',
  print: 'M7 9V4h10v5M7 17H5V9.5h14V17h-2M7 14h10v6H7z',
  speaker: 'M4 10v4h3.5l4.5 3.5v-11L7.5 10zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  stop: 'M7 7h10v10H7z',
  compare: 'M8 4 4 8l4 4M4 8h13M16 20l4-4-4-4M20 16H7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.5-3.6 3.5-6 7.5-6s7 2.4 7.5 6',
  lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5',
  logout: 'M10 4.5H5v15h5M14 8l4 4-4 4M18 12H9',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10 11v5M14 11v5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  chevron: 'm9 6 6 6-6 6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 12h17M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z',
  shield: 'M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3.5 3.5l17 17M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.3C4 9 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.4-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  sparkle: 'M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  arrowUp: 'M12 19V6M6.5 11.5 12 6l5.5 5.5',
  arrowDown: 'M12 5v13M6.5 12.5 12 18l5.5-5.5',
};

export default function Icon({ name, size = 20, ...rest }: { name: keyof typeof P | string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

/** MediLens mark: a lens with a pulse line. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0e6e8c" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M9.5 16.5h3l1.8-4 2.6 7 1.8-3h3.3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
