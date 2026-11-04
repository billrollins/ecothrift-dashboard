/**
 * The two places the e-sign owner pages show up (Dash Updates #21 and #62). The same tracker, template editor and
 * box placer serve both; each place sees only its own kinds.
 *
 * - Contractors (/admin/contractors): contractor agreements. Owner only, kept off the staff side: the contractor
 *   signs by a single-use link with no Dash account, then the owner countersigns.
 * - HR documents (HR > Requests > Documents): everything else sent to staff (handbook and policy acknowledgments,
 *   onboarding forms). Staff sign while signed in, from HR > Requests.
 */
export const CONTRACTOR_KIND = 'contractor';

export interface EsignScope {
  key: 'hr' | 'contractors';
  /** The tracker. */
  home: string;
  /** Where its template editor and box placer live: `${base}/templates/:id`, `${base}/:id/boxes`. */
  base: string;
  /** Which document kinds belong here. */
  owns: (kind: string) => boolean;
  defaultKind: string;
  /** "Send to everyone" (a handbook acknowledgment each): staff only. */
  everyone: boolean;
  /** Who it goes to: staff from Dash, or outsiders by email. */
  staffSigners: boolean;
}

export const HR_SCOPE: EsignScope = {
  key: 'hr',
  home: '/hr/requests/documents',
  base: '/admin/documents',
  owns: (kind) => kind !== CONTRACTOR_KIND,
  defaultKind: 'handbook',
  everyone: true,
  staffSigners: true,
};

export const CONTRACTOR_SCOPE: EsignScope = {
  key: 'contractors',
  home: '/admin/contractors',
  base: '/admin/contractors',
  owns: (kind) => kind === CONTRACTOR_KIND,
  defaultKind: CONTRACTOR_KIND,
  everyone: false,
  staffSigners: false,
};

/** A link with no email behind it (the mailbox was down, or a staff signer): what the owner is told. */
export const NOT_EMAILED =
  'The email did not go out. Send this private link yourself (a text works). It works once and lasts 14 days.';
