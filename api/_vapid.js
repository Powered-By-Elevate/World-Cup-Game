/** Shared VAPID env hygiene (files starting with _ are not routed by Vercel).
 *
 * Values pasted into the Vercel dashboard often pick up stray quotes or
 * whitespace, and a subject without its mailto: prefix is easy to set.
 * Google's push service tolerates a sloppy JWT subject; Apple rejects the
 * whole token (403 BadJwtToken) — which silently kills every iPhone push
 * while desktop keeps working. Sanitize here, in one place.
 */
export function vapidConfig() {
  const clean = (s) => (s || '').toString().trim().replace(/^['"]+|['"]+$/g, '').trim();
  const publicKey = clean(process.env.VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VAPID_PRIVATE_KEY);

  // Apple requires the JWT sub claim to be a valid mailto: or https: URL.
  let subject = clean(process.env.VAPID_SUBJECT);
  if (subject && !/^(mailto:|https:\/\/)/i.test(subject)) {
    subject = subject.includes('@') ? `mailto:${subject}` : '';
  }
  if (!subject) subject = 'mailto:mknowles@true-north-companies.com';

  // which env vars needed cleaning — surfaced by the GET /api/push diagnostics
  const messy = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
    .filter((k) => { const v = process.env[k]; return v != null && v !== clean(v); });

  return { publicKey, privateKey, subject, subjectEnvSet: !!process.env.VAPID_SUBJECT, messy };
}
