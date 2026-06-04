// signup-config.js — open self-signup section allowlist (value:label pairs).
//
// Students self-enroll into a "section" (the gradebook bucket). The label is what
// they SEE; the value is what gets written to roster.section. The two differ on
// purpose: value "PeriodX" shows as "Period X" so the real period is never revealed.
//
// Configured via the env var OPEN_SIGNUP_SECTIONS. Format (semicolon-separated,
// value:label, label may contain spaces):
//     OPEN_SIGNUP_SECTIONS="PeriodX:Period X"
//     OPEN_SIGNUP_SECTIONS="PeriodA:Period A;PeriodB:Period B;PeriodE:Period E"
//
// Default (env unset): the existing single hidden period. The VALUE is "PeriodX"
// — the live convention every current student is registered under, and the section
// the Desk sign-in dropdown queries (/roster/section/PeriodX); using anything else
// would make new signups invisible there. The LABEL is "Period X". The schedule a
// student SEES is forced to E in the Desk (cP='E'); the section value is a separate
// axis. Change the env + redeploy when real periods are assigned — no code edit.

const DEFAULT_SECTIONS = [{ value: 'PeriodX', label: 'Period X' }];

// Pure parser — exported for tests. Never throws; falls back to DEFAULT_SECTIONS.
export function parseOpenSections(envValue) {
  if (!envValue || typeof envValue !== 'string') return DEFAULT_SECTIONS.slice();

  const out = [];
  for (const part of envValue.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    const value = (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim();
    const label = (idx === -1 ? '' : trimmed.slice(idx + 1)).trim() || value;
    if (value) out.push({ value, label });
  }
  return out.length ? out : DEFAULT_SECTIONS.slice();
}

// Read the live allowlist from the environment.
export function getOpenSections() {
  return parseOpenSections(process.env.OPEN_SIGNUP_SECTIONS);
}

// Is this section value one a student may self-enroll into? (Authoritative gate —
// the server NEVER trusts the section the client sends without this check.)
export function isOpenSection(value) {
  return getOpenSections().some((s) => s.value === value);
}
