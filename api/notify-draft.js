/**
 * Draft-day notifications. When the commissioner runs the draft, the client
 * POSTs here and we fan out to everyone:
 *   - Web Push to every stored subscription (lock-screen banner)
 *   - Email to every member with an address (universal fallback)
 *
 * Commissioner-gated: the caller's Supabase session JWT is verified and checked
 * against the commissioner member in the league's shared state. App_kv is read
 * with the anon key (it's intentionally anon-readable); no service-role key is
 * needed here.
 *
 * GET (no auth) returns { publicKey } so the client can subscribe to push.
 *
 * Env (Vercel, server-side):
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   web-push keypair
 *   VAPID_SUBJECT                          mailto: contact (optional)
 *   GMAIL_USER / GMAIL_APP_PASSWORD        Gmail sender (same as Supabase SMTP)
 *   SUPABASE_URL / SUPABASE_ANON_KEY       fall back to the VITE_ vars
 */

import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@worldcupdraft.app';

  // Public config for the client to subscribe — no auth needed. Also reports
  // (booleans only, no secrets) whether each notification channel is configured.
  if (req.method === 'GET') {
    res.status(200).json({
      publicKey: VAPID_PUBLIC || null,
      pushReady: !!(VAPID_PUBLIC && VAPID_PRIVATE),
      emailReady: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    });
    return;
  }

  if (!url || !anonKey) { res.status(200).json({ error: 'not_configured' }); return; }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const league = (body.league || '').toString().trim();
  const names = body.names || {};
  const link = (body.url || '').toString();
  if (!league) { res.status(400).json({ error: 'bad_request' }); return; }

  const sb = createClient(url, anonKey, NOAUTH);

  // Verify caller + commissioner gate.
  const { data: ures, error: uerr } = await sb.auth.getUser(token);
  const requester = ures?.user;
  if (uerr || !requester) { res.status(401).json({ error: 'unauthorized' }); return; }

  const { data: row, error: rerr } = await sb
    .from('app_kv').select('value').eq('key', `${league}:wc:state`).maybeSingle();
  if (rerr) { res.status(500).json({ error: 'state_read_failed', reason: rerr.message }); return; }
  const state = row?.value || null;
  const commishId = state?.commissioner || null;
  let allowed = false;
  if (commishId) {
    for (const t of (state.teams || [])) {
      for (const m of (t.members || [])) {
        if (m.id === commishId && m.uid === requester.id) { allowed = true; break; }
      }
      if (allowed) break;
    }
  }
  if (!allowed) { res.status(403).json({ error: 'forbidden' }); return; }

  // "Spain · Morocco · Ghana" for a team, using the names map the client sent.
  const teamLine = (t) => ['FAV', 'UND', 'LNG'].map(pk => names[t.picks?.[pk]] || null).filter(Boolean).join(' · ');

  // Resolve every member's email. Prefer the captured member.email, then fall
  // back to the real account email (service role) so people who haven't reopened
  // the app since email-capture shipped are still reached.
  const uidToEmail = {};
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    try {
      const admin = createClient(url, serviceKey, NOAUTH);
      for (let page = 1; page <= 25; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        const users = data?.users || [];
        for (const u of users) if (u.email) uidToEmail[u.id] = u.email;
        if (users.length < 200) break;
      }
    } catch { /* fall back to captured emails only */ }
  }

  // ---- EMAIL (one per unique address, personalized to their team) ----
  let emailed = 0;
  const emailErrors = [];
  const gmailUser = process.env.GMAIL_USER, gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass) {
    const recipients = {};   // email → { teamName, line }
    for (const t of (state.teams || [])) {
      const line = teamLine(t);
      for (const m of (t.members || [])) {
        const email = (m.email || uidToEmail[m.uid] || '').trim().toLowerCase();
        if (email && !recipients[email]) recipients[email] = { teamName: t.name, line };
      }
    }
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
    for (const [email, info] of Object.entries(recipients)) {
      const line = info.line;
      try {
        await transport.sendMail({
          from: `World Cup Draft <${gmailUser}>`,
          to: email,
          subject: '🏆 The draft is done!',
          text: `The draft has run!\n\nYour team "${info.teamName}"${line ? `: ${line}` : ''}.\n\nTap to view your teams: ${link}`,
          html: `<p style="font-size:16px">The draft has run! 🎉</p>`
            + `<p style="font-size:16px">Your team <b>${info.teamName}</b>${line ? `:<br><b style="font-size:18px">${line}</b>` : ''}.</p>`
            + `<p><a href="${link}" style="font-size:16px">Tap to view your teams →</a></p>`,
        });
        emailed++;
      } catch (e) { emailErrors.push(String(e?.message || e)); }
    }
  }

  // ---- WEB PUSH (every stored subscription) ----
  let pushed = 0;
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    const { data: prow } = await sb.from('app_kv').select('value').eq('key', `${league}:wc:push`).maybeSingle();
    const subs = Array.isArray(prow?.value) ? prow.value : [];
    const teamOfUid = {};
    for (const t of (state.teams || [])) for (const m of (t.members || [])) if (m.uid) teamOfUid[m.uid] = t;
    const live = [];
    for (const entry of subs) {
      const sub = entry.sub || entry;
      const t = entry.uid ? teamOfUid[entry.uid] : null;
      const line = t ? teamLine(t) : '';
      const payload = JSON.stringify({
        title: '🏆 The draft is done!',
        body: t ? `Your team ${t.name}${line ? `: ${line}` : ''} — tap to view` : 'Tap to see your teams',
        url: link || '/',
      });
      try { await webpush.sendNotification(sub, payload); pushed++; live.push(entry); }
      catch (e) { if (e?.statusCode !== 404 && e?.statusCode !== 410) live.push(entry); }   // drop dead subs
    }
    if (live.length !== subs.length) {
      await sb.from('app_kv').upsert({ key: `${league}:wc:push`, value: live, updated_at: new Date().toISOString() });
    }
  }

  res.status(200).json({ ok: true, emailed, pushed, emailErrors: emailErrors.slice(0, 3) });
}
