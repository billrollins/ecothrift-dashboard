/** Small shared pieces of the Supplies pages (owner, 2026-10-26). */
import { Link } from '@mui/material';
import type { ReactNode } from 'react';

/** "Mon Nov 2, 3:00 PM" in store time. */
export function deadlineText(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function dayText(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function whenText(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A vendor or item link: always a new tab. Plain text when there is no link. */
export function OutLink({ href, children }: { href: string; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover" onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}

/** "50 rolls a pack" or "each". */
export function packText(packSize: number, unit: string): string {
  const u = unit || 'each';
  return packSize > 1 ? `${packSize} ${u} a pack` : `1 ${u}`;
}

export function apiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { detail?: string } } })?.response?.data;
  return (data && typeof data.detail === 'string' && data.detail) || fallback;
}
