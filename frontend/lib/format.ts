import { Lang } from './i18n';

export function fmtDate(d: string | null | undefined, lang: Lang) {
  if (!d) return '';
  const date = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  return date.toLocaleDateString(lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const today = () => new Date().toISOString().slice(0, 10);

export function rangeLabel(low: number | null, high: number | null) {
  if (low != null && high != null) return `${low} – ${high}`;
  if (high != null) return `< ${high}`;
  if (low != null) return `> ${low}`;
  return '';
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const bnNum = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[+d]);

/**
 * The AI service gives the "how we checked" line in English (the doctor PDF needs English).
 * On the Bangla site we turn the same sentence into Bangla here. Unknown wording stays English.
 */
export function reasonBn(reason: string): string {
  const N = '(-?[\\d.]+)';
  const where = (w: string) => (w.includes('report') ? 'রিপোর্টে ছাপা সীমা অনুযায়ী' : 'আপনার বয়স ও লিঙ্গের স্বাভাবিক সীমা অনুযায়ী');
  let m: RegExpMatchArray | null;
  let out: string | null = null;
  if ((m = reason.match(new RegExp(`^${N} is below the critical limit ${N}`)))) out = `${m[1]} জরুরি নিচের সীমা ${m[2]}-এর নিচে। এখনই চিকিৎসকের কাছে যান।`;
  else if ((m = reason.match(new RegExp(`^${N} is above the critical limit ${N}`)))) out = `${m[1]} জরুরি উপরের সীমা ${m[2]}-এর উপরে। এখনই চিকিৎসকের কাছে যান।`;
  else if ((m = reason.match(new RegExp(`^${N} is slightly above the limit ${N} (.+?) \\(borderline zone up to ${N}\\)`)))) out = `${where(m[3])}, ${m[1]} সীমা ${m[2]}-এর সামান্য উপরে (সীমার কাছাকাছি অংশ ${m[4]} পর্যন্ত)।`;
  else if ((m = reason.match(new RegExp(`^${N} is slightly below the limit ${N} (.+?) \\(borderline zone down to ${N}\\)`)))) out = `${where(m[3])}, ${m[1]} সীমা ${m[2]}-এর সামান্য নিচে (সীমার কাছাকাছি অংশ ${m[4]} পর্যন্ত)।`;
  else if ((m = reason.match(new RegExp(`^${N} is ${N} above the upper limit ${N} (.+)$`)))) out = `${where(m[4])}, ${m[1]} উপরের সীমা ${m[3]}-এর চেয়ে ${m[2]} বেশি।`;
  else if ((m = reason.match(new RegExp(`^${N} is ${N} below the lower limit ${N} (.+)$`)))) out = `${where(m[4])}, ${m[1]} নিচের সীমা ${m[3]}-এর চেয়ে ${m[2]} কম।`;
  else if ((m = reason.match(new RegExp(`^${N} is within the range (\\S+) to (\\S+) (.+)$`)))) out = `${where(m[4])}, ${m[1]} স্বাভাবিক সীমা ${m[2]} থেকে ${m[3]}-এর মধ্যে।`;
  return out ? bnNum(out) : reason;
}
