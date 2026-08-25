/**
 * Original is where the item started. Current is where it is now.
 * Slate → green on the command deck and the grade table.
 */
import type { PressPaint } from './studio/PressPicker';

export const GRADE_ROLE = {
  original: {
    ink: '#4a5a52',
    mark: '#5c6f65',
    wash: 'rgba(74, 90, 82, 0.08)',
    border: '#b7c4b9',
    console: '#c3d0c8',
  },
  current: {
    ink: '#2e7d32',
    mark: '#2e7d32',
    wash: 'rgba(46, 125, 50, 0.10)',
    border: '#a5d6a7',
    console: '#7fc79a',
  },
} as const;

export const ORIGINAL_PAINT: PressPaint = {
  bgcolor: 'rgba(255, 255, 255, 0.08)',
  bgcolorTo: 'rgba(255, 255, 255, 0.14)',
  border: '#59695f',
  color: '#e4ebe6',
  strong: '#8fa396',
  onStrong: '#16211c',
  menuBgcolor: '#f2f6f3',
  menuBgcolorTo: '#dfe7e1',
  menuColor: '#2a3a32',
};

export const CURRENT_PAINT: PressPaint = {
  bgcolor: 'rgba(127, 199, 154, 0.18)',
  bgcolorTo: 'rgba(127, 199, 154, 0.30)',
  border: '#4f8a68',
  color: '#d7f0e0',
  strong: '#7fc79a',
  onStrong: '#12241b',
  menuBgcolor: '#e8f5e9',
  menuBgcolorTo: '#c8e6c9',
  menuColor: '#1b5e20',
};

export function gradeRoleWash(original: boolean, current: boolean): string {
  if (original && current) {
    return `linear-gradient(90deg, ${GRADE_ROLE.original.wash} 0%, ${GRADE_ROLE.current.wash} 100%)`;
  }
  if (original) return GRADE_ROLE.original.wash;
  if (current) return GRADE_ROLE.current.wash;
  return 'transparent';
}
