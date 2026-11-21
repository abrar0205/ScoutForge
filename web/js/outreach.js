/**
 * First-touch outreach drafts (English and German) and a candidate-experience check.
 *
 * Drafts never invent employer facts: anything the recruiter must supply is a
 * [bracketed placeholder], and the quality check fails until those are filled.
 */

export function outreachDraft({ lang = 'en', title, skills = [], location = 'Grünheide near Berlin', tone = 'concise' }) {
  title = String(title || '').replace(/\s+[-–|,(].*$/, '').trim() || (lang === 'de' ? 'diese Rolle' : 'this role');
  const top = skills.filter((s) => s.selected && !s.contextOnly).slice(0, 2).map((s) => s.name);
  const skillText = top.length ? top.join(lang === 'de' ? ' und ' : ' and ') : (lang === 'de' ? 'Ihrem Fachgebiet' : 'your field');
  if (lang === 'de') {
    return {
      subject: `${title} bei Berlin: kurzer Austausch?`,
      body: [
        'Guten Tag [Vorname Nachname],',
        '',
        `Ihr Profil ist mir aufgefallen, besonders [konkreter Punkt aus dem Profil]. Wir suchen für ${location} eine Person als ${title}, die Erfahrung mit ${skillText} mitbringt.`,
        tone === 'warm'
          ? '[Ein Satz, was diese Rolle oder dieses Team besonders macht – bitte selbst prüfen.]'
          : '[Ein Satz zum Team oder Projekt – bitte selbst prüfen.]',
        '',
        'Hätten Sie diese oder nächste Woche 15 Minuten für ein unverbindliches Gespräch?',
        'Falls es gerade nicht passt, geben Sie mir gern kurz Bescheid – dann melde ich mich nicht erneut.',
        '',
        'Viele Grüße',
        '[Ihr Name]',
      ].join('\n'),
    };
  }
  return {
    subject: `${title} near Berlin: open to a quick chat?`,
    body: [
      'Hi [First name],',
      '',
      `Your background caught my eye, especially [specific point from their profile]. We are looking for a ${title} in ${location} with experience in ${skillText}.`,
      tone === 'warm'
        ? '[One sentence on what makes this team or project worth their time; verify it.]'
        : '[One sentence on the team or project; verify it.]',
      '',
      'Would you be open to a 15-minute call this week or next?',
      'If the timing is not right, just let me know and I will not follow up.',
      '',
      'Best regards,',
      '[Your name]',
    ].join('\n'),
  };
}

const JARGON = /\b(rockstar|ninja|guru|unicorn|crush it|work hard play hard|wizard|world-class talent|dream job|amazing opportunity|exciting opportunity|einmalige chance|traumjob)\b/i;
const CTA = /\?\s*$|\b(call|chat|talk|gespräch|telefonat|austausch|termin|rozmow)\w*\b[^.\n]*\?/im;
const OPT_OUT = /(not the right time|timing is not right|not a good time|not interested|will not follow up|won't follow up|no longer|nicht passt|kein interesse|nicht erneut|nie jest|nie pasuje)/i;
const DU = /\b(du|dich|dir|dein|deine|deinen|deinem|euch)\b/i;
const SIE = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem)\b/;

/** Returns { score 0–100, checks: [{ id, label, pass, detail }] }. */
export function checkOutreach({ subject = '', body = '', lang = 'en' }) {
  const text = String(body);
  const words = (text.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
  const sentences = text.split(/[.!?]+\s|\n+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);
  const longest = Math.max(0, ...sentences.map((s) => s.split(/\s+/).length));
  const placeholders = (text + ' ' + subject).match(/\[[^\]]+\]|\{\{[^}]+\}\}/g) || [];
  const checks = [
    { id: 'length', label: 'Short enough to read on a phone (50–130 words)', pass: words >= 50 && words <= 130, detail: `${words} words` },
    { id: 'subject', label: 'Subject line under 60 characters', pass: subject.trim().length > 0 && subject.length <= 60, detail: `${subject.length} characters` },
    { id: 'placeholders', label: 'All placeholders filled in', pass: placeholders.length === 0, detail: placeholders.length ? `${placeholders.length} left: ${placeholders.slice(0, 2).join(', ')}` : 'none left' },
    { id: 'personal', label: 'Says why this person (personalised line)', pass: /\b(your|ihr|ihre|ihrem|twój|twoje)\b[^.\n]{0,80}\b(profile|background|experience|work|profil|erfahrung|projekt|doświadczenie)/i.test(text) && !/\[(specific point|konkreter punkt)/i.test(text), detail: 'mention something specific from their profile' },
    { id: 'cta', label: 'One clear, low-effort ask', pass: CTA.test(text), detail: 'e.g. a 15-minute call' },
    { id: 'optout', label: 'Easy way to say no', pass: OPT_OUT.test(text), detail: 'respects candidate time' },
    { id: 'readable', label: 'Sentences under 30 words', pass: longest <= 30, detail: `longest: ${longest} words` },
    { id: 'tone', label: 'No hype or jargon', pass: !JARGON.test(text + ' ' + subject) && (text.match(/!/g) || []).length <= 1, detail: 'avoid “rockstar”, “ninja”, many “!”' },
  ];
  if (lang === 'de') {
    const mixed = DU.test(text) && SIE.test(text.replace(/^.*\n/, ''));
    checks.push({ id: 'address', label: 'Consistent form of address (Sie or du)', pass: !mixed, detail: mixed ? 'mixes “Sie” and “du”' : 'consistent' });
  }
  const passed = checks.filter((c) => c.pass).length;
  return { score: Math.round((passed / checks.length) * 100), checks };
}
