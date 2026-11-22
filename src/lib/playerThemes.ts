export interface DartColorOption {
  id: string;
  label: string;
  hex: string;
  description: string;
}

/**
 * Curated dart flight / stem colours with subtle, dark-room-friendly theme tints
 */
export const DART_COLOR_OPTIONS: DartColorOption[] = [
  { id: 'emerald', label: 'Emerald', hex: '#10B981', description: 'Classic green flights' },
  { id: 'crimson', label: 'Crimson', hex: '#EF4444', description: 'Deep red darts' },
  { id: 'sky', label: 'Electric Blue', hex: '#38BDF8', description: 'Cool blue flights' },
  { id: 'gold', label: 'Solar Gold', hex: '#F59E0B', description: 'Yellow / gold shafts' },
  { id: 'purple', label: 'Royal Purple', hex: '#A855F7', description: 'Violet / purple flights' },
  { id: 'orange', label: 'Tangerine', hex: '#F97316', description: 'Bright orange darts' },
  { id: 'pink', label: 'Hot Pink', hex: '#EC4899', description: 'Neon pink flights' },
  { id: 'cyan', label: 'Ice Cyan', hex: '#06B6D4', description: 'Aqua / teal shafts' },
  { id: 'silver', label: 'Titanium', hex: '#CBD5E1', description: 'White / silver darts' },
];

export const DEFAULT_DART_COLOR = '#10B981';

/**
 * Converts a #RRGGBB hex colour to an "R, G, B" string for CSS rgba(var(--player-tint-rgb), alpha)
 */
export function hexToRgbTriplet(hex?: string): string {
  if (!hex) return '16, 185, 129';
  const cleaned = hex.replace('#', '').trim();
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return '16, 185, 129';
  }

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function getDartColorLabel(hex?: string): string {
  if (!hex) return 'Emerald';
  const match = DART_COLOR_OPTIONS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  return match ? match.label : 'Custom';
}
