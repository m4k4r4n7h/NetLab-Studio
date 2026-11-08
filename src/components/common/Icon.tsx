import type { ReactNode } from 'react';

export type IconName =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'undo'
  | 'redo'
  | 'select'
  | 'move'
  | 'delete'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'notes'
  | 'inspect'
  | 'play'
  | 'pause'
  | 'step-forward'
  | 'step-back'
  | 'reset'
  | 'close'
  | 'plus'
  | 'terminal'
  | 'check'
  | 'warning'
  | 'offline'
  | 'online'
  | 'wifi'
  | 'cable'
  | 'router'
  | 'switch'
  | 'hub'
  | 'wireless-router'
  | 'access-point'
  | 'pc'
  | 'laptop'
  | 'server'
  | 'printer'
  | 'patch-panel'
  | 'labs'
  | 'template'
  | 'challenge'
  | 'chevron-down'
  | 'chevron-right'
  | 'network'
  | 'event'
  | 'layers'
  | 'trash';

const paths: Record<IconName, ReactNode> = {
  new: <><path d="M5 2h7l4 4v8H5z" /><path d="M12 2v4h4" /><path d="M8 9h5M8 12h5" /></>,
  open: <><path d="M2 5h5l2 2h7v7H2z" /><path d="M2 8h14" /></>,
  save: <><path d="M3 3h9l3 3v9H3z" /><path d="M6 3v4h6V3" /><path d="M6 11h6v4H6z" /></>,
  'save-as': <><path d="M3 3h8l3 3v5" /><path d="M3 3v11h5" /><path d="M12 13l4 4 3-3-4-4z" /></>,
  undo: <><path d="M4 9h8a4 4 0 010 8H8" /><path d="M4 9l4-4M4 9l4 4" /></>,
  redo: <><path d="M14 9H6a4 4 0 000 8h4" /><path d="M14 9l-4-4M14 9l-4 4" /></>,
  select: <><path d="M5 3l8 8-4 1 2 4-2 1-2-4-2 3z" /></>,
  move: <><path d="M9 2v14M2 9h14" /><path d="M9 2l-2 2M9 2l2 2M9 16l-2-2M9 16l2-2M2 9l2-2M2 9l2 2M16 9l-2-2M16 9l-2 2" /></>,
  delete: <><path d="M3 5h12" /><path d="M6 5V3h6v2" /><path d="M5 5l1 11h6l1-11" /></>,
  'zoom-in': <><circle cx="8" cy="8" r="5" /><path d="M12 12l4 4M6 8h4M8 6v4" /></>,
  'zoom-out': <><circle cx="8" cy="8" r="5" /><path d="M12 12l4 4M6 8h4" /></>,
  fit: <><path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" /></>,
  notes: <><path d="M3 2h12v14H3z" /><path d="M6 6h6M6 9h6M6 12h4" /></>,
  inspect: <><circle cx="8" cy="8" r="4" /><path d="M11 11l4 4" /><path d="M6 8h4M8 6v4" /></>,
  play: <path d="M5 3l9 6-9 6z" />,
  pause: <><path d="M6 4v10M12 4v10" /></>,
  'step-forward': <><path d="M5 4l7 5-7 5z" /><path d="M13 4v10" /></>,
  'step-back': <><path d="M13 4L6 9l7 5z" /><path d="M4 4v10" /></>,
  reset: <><path d="M3 8a6 6 0 116 6" /><path d="M3 4v4h4" /></>,
  close: <><path d="M4 4l10 10M14 4L4 14" /></>,
  plus: <><path d="M9 3v12M3 9h12" /></>,
  terminal: <><path d="M2 3h14v12H2z" /><path d="M4 7l2 2-2 2M8 11h4" /></>,
  check: <path d="M3 9l4 4 8-8" />,
  warning: <><path d="M9 2l7 13H2z" /><path d="M9 7v4M9 13v.5" /></>,
  offline: <><path d="M2 6a11 11 0 0114 0M5 9a7 7 0 016 0M8 12a3 3 0 012 0" /><path d="M3 3l12 12" /></>,
  online: <><path d="M2 6a11 11 0 0114 0M5 9a7 7 0 016 0M8 12a3 3 0 012 0" /></>,
  wifi: <><path d="M2 6a11 11 0 0114 0M5 9a7 7 0 016 0M7 12a3 3 0 014 0" /><circle cx="9" cy="15" r="1" /></>,
  cable: <><path d="M2 5h4v4h6V5h4" /><path d="M4 9v3h10V9" /></>,
  router: <><circle cx="9" cy="9" r="6" /><path d="M6 7h6M6 10h6M7 7l2 2-2 2M11 10l-2-2 2-2" /></>,
  switch: <><rect x="2" y="6" width="14" height="7" rx="1" /><path d="M4 9h2M7 9h2M10 9h2M13 9h1M4 11h10" /></>,
  hub: <><rect x="2" y="7" width="14" height="5" rx="1" /><circle cx="5" cy="9.5" r="1" /><circle cx="9" cy="9.5" r="1" /><circle cx="13" cy="9.5" r="1" /></>,
  'wireless-router': <><circle cx="9" cy="9" r="5" /><path d="M7 8h4M7 10h4" /><path d="M13 3a8 8 0 013 3M15 2a10 10 0 013 3" /></>,
  'access-point': <><path d="M5 14V9h8v5" /><path d="M9 9V5" /><path d="M5 4a6 6 0 018 0M7 6a4 4 0 014 0" /><circle cx="9" cy="8" r="1" /></>,
  pc: <><rect x="2" y="3" width="14" height="9" rx="1" /><path d="M6 15h6M9 12v3" /></>,
  laptop: <><rect x="4" y="3" width="10" height="7" rx="1" /><path d="M2 13h14l-1 2H3z" /></>,
  server: <><rect x="4" y="2" width="10" height="14" rx="1" /><path d="M6 5h6M6 8h6M6 11h6" /><circle cx="7" cy="14" r=".6" /></>,
  printer: <><path d="M5 7V3h8v4" /><rect x="3" y="7" width="12" height="5" rx="1" /><path d="M5 12h8v4H5z" /></>,
  'patch-panel': <><rect x="2" y="5" width="14" height="8" rx="1" /><path d="M4 8h2M7 8h2M10 8h2M13 8h1M4 10h2M7 10h2M10 10h2M13 10h1" /></>,
  labs: <><path d="M7 2h4v5l4 8a2 2 0 01-2 3H5a2 2 0 01-2-3l4-8z" /><path d="M5 12h8" /></>,
  template: <><rect x="2" y="2" width="6" height="6" /><rect x="10" y="2" width="6" height="6" /><rect x="2" y="10" width="6" height="6" /><rect x="10" y="10" width="6" height="6" /></>,
  challenge: <><path d="M4 2h10v6a5 5 0 01-10 0z" /><path d="M4 4H2v2a3 3 0 003 3M14 4h2v2a3 3 0 01-3 3" /><path d="M9 13v3M6 16h6" /></>,
  'chevron-down': <path d="M3 6l6 6 6-6" />,
  'chevron-right': <path d="M6 3l6 6-6 6" />,
  network: <><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="14" r="1.5" /><circle cx="15" cy="14" r="1.5" /><path d="M9 4.5v4M9 8.5L4 12.5M9 8.5l5 4" /></>,
  event: <><circle cx="9" cy="9" r="6" /><path d="M9 5v4l3 2" /></>,
  layers: <><path d="M9 2l7 4-7 4-7-4z" /><path d="M2 9l7 4 7-4M2 12l7 4 7-4" /></>,
  trash: <><path d="M3 5h12" /><path d="M6 5V3h6v2M5 5l1 11h6l1-11" /></>
};

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
