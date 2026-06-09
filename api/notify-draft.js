/**
 * Draft-day + announcement notifications (Web Push + email).
 *
 * POST modes:
 *   mode: 'draft'    (default) — the draft reveal: each couple gets their team's
 *                    three nation flags + a "view your teams" button.
 *   mode: 'announce' — a free-text message from the commissioner to the whole pool.
 *
 * Commissioner-gated. App_kv is read with the anon key; emails are resolved from
 * member.email and (via the service-role key) auth.users, so everyone with an
 * account is reached. GET (no auth) returns { publicKey, pushReady, emailReady }.
 *
 * Env (Vercel): VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT,
 *   GMAIL_USER / GMAIL_APP_PASSWORD, SUPABASE_URL / SUPABASE_ANON_KEY
 *   (fall back to VITE_*), SUPABASE_SERVICE_ROLE_KEY (for the account lookup).
 */

import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const NOAUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const POT_LABEL = { FAV: 'Favorite', UND: 'Underdog', LNG: 'Longshot' };
const INK = '#15120C', LIME = '#C8F23C', MUTE = '#8a8575';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shell(inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2EFE6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e7e3d7;">
        <tr><td style="background:${INK};padding:18px 24px;">
          <span style="font-family:Arial,sans-serif;font-weight:800;letter-spacing:.14em;font-size:13px;color:${LIME};text-transform:uppercase;">⚽ World Cup Family Draft</span>
        </td></tr>
        ${inner}
      </table>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:${MUTE};margin-top:14px;">You're getting this because you're in a World Cup family pool.</div>
    </td></tr>
  </table>`;
}

function ctaButton(link, label) {
  if (!link) return '';
  return `<tr><td align="center" style="padding:8px 24px 28px;">
    <a href="${esc(link)}" style="background:${INK};color:${LIME};font-family:Arial,sans-serif;font-weight:800;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:12px;display:inline-block;">${esc(label)} →</a>
  </td></tr>`;
}

export function draftHtml(teamName, picks, link) {
  const cells = picks.map(p => `
    <td align="center" valign="top" style="padding:0 6px;">
      <img src="https://flagcdn.com/w160/${esc(p.flag)}.png" width="62" height="46" alt="${esc(p.name)}" style="border-radius:9px;display:block;border:2px solid ${INK};" />
      <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:${INK};margin-top:7px;">${esc(p.name)}</div>
      <div style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:${MUTE};margin-top:2px;">${esc(p.pot)}</div>
    </td>`).join('');
  return shell(`
    <tr><td align="center" style="padding:28px 24px 6px;">
      <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTE};">The draft is done 🎉</div>
      <div style="font-family:Arial,sans-serif;font-size:30px;font-weight:800;color:${INK};margin-top:6px;line-height:1.1;">${esc(teamName)}</div>
    </td></tr>
    <tr><td align="center" style="padding:18px 18px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>${cells || '<td style="font-family:Arial,sans-serif;color:' + MUTE + '">Your nations are set.</td>'}</tr></table>
    </td></tr>
    ${ctaButton(link, 'View your teams')}`);
}

export function announceHtml(message, link) {
  return shell(`
    <tr><td style="padding:26px 26px 8px;">
      <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTE};">📣 From your commissioner</div>
      <div style="font-family:Arial,sans-serif;font-size:16px;color:${INK};margin-top:12px;line-height:1.55;white-space:pre-wrap;">${esc(message).replace(/\n/g, '<br>')}</div>
    </td></tr>
    ${ctaButton(link, 'Open the pool')}`);
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@worldcupdraft.app';

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
  const nations = body.nations || {};
  const link = (body.url || '').toString();
  const mode = body.mode === 'announce' ? 'announce' : 'draft';
  const message = (body.message || '').toString().trim();
  const subject = (body.subject || '').toString().trim();
  if (!league) { res.status(400).json({ error: 'bad_request' }); return; }
  if (mode === 'announce' && !message) { res.status(400).json({ error: 'empty_message' }); return; }

  const sb = createClient(url, anonKey, NOAUTH);

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

  const nm = (nid) => (nations[nid] && nations[nid].n) || null;
  const teamLine = (t) => ['FAV', 'UND', 'LNG'].map(pk => nm(t.picks?.[pk])).filter(Boolean).join(' · ');
  const teamPicks = (t) => ['FAV', 'UND', 'LNG'].map(pk => {
    const nid = t.picks?.[pk], x = nid && nations[nid];
    return x ? { name: x.n, flag: x.f, pot: POT_LABEL[pk] } : null;
  }).filter(Boolean);

  // Resolve every member's email (member.email, then the real account email).
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

  // recipients: one entry per unique email, with their team for personalization.
  const recipients = {};
  for (const t of (state.teams || [])) {
    for (const m of (t.members || [])) {
      const email = (m.email || uidToEmail[m.uid] || '').trim().toLowerCase();
      if (email && !recipients[email]) recipients[email] = { teamName: t.name, line: teamLine(t), picks: teamPicks(t) };
    }
  }

  // ---- EMAIL ----
  let emailed = 0;
  const emailErrors = [];
  const gmailUser = process.env.GMAIL_USER, gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass) {
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
    const subj = mode === 'announce' ? (subject || '📣 World Cup pool update') : '🏆 The draft is done!';
    for (const [email, info] of Object.entries(recipients)) {
      try {
        const html = mode === 'announce'
          ? announceHtml(message, link)
          : draftHtml(info.teamName, info.picks, link);
        const text = mode === 'announce'
          ? `${message}\n\n${link}`
          : `The draft has run!\n\nYour team "${info.teamName}"${info.line ? `: ${info.line}` : ''}.\n\nView your teams: ${link}`;
        await transport.sendMail({ from: `World Cup Draft <${gmailUser}>`, to: email, subject: subj, text, html });
        emailed++;
      } catch (e) { emailErrors.push(String(e?.message || e)); }
    }
  }

  // ---- WEB PUSH ----
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
      let payload;
      if (mode === 'announce') {
        payload = JSON.stringify({ title: subject || '📣 Pool update', body: message, url: link || '/' });
      } else {
        const t = entry.uid ? teamOfUid[entry.uid] : null;
        const line = t ? teamLine(t) : '';
        payload = JSON.stringify({
          title: '🏆 The draft is done!',
          body: t ? `Your team ${t.name}${line ? `: ${line}` : ''} — tap to view` : 'Tap to see your teams',
          url: link || '/',
        });
      }
      try { await webpush.sendNotification(sub, payload); pushed++; live.push(entry); }
      catch (e) { if (e?.statusCode !== 404 && e?.statusCode !== 410) live.push(entry); }
    }
    if (live.length !== subs.length) {
      await sb.from('app_kv').upsert({ key: `${league}:wc:push`, value: live, updated_at: new Date().toISOString() });
    }
  }

  res.status(200).json({ ok: true, emailed, pushed, emailErrors: emailErrors.slice(0, 3) });
}
