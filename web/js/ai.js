/**
 * Optional AI assist (bring your own key).
 *
 * - Runs only when the user enters an API key. The key is kept in memory for the
 *   current tab and is sent only to the provider endpoint the user chose.
 * - The model only *suggests*; every suggestion is validated here and must be
 *   approved by a recruiter before it reaches a search string.
 * - Supported: Anthropic Messages API, and any OpenAI-compatible Chat Completions
 *   endpoint (e.g. an internal AI gateway, Azure OpenAI proxy or local Ollama).
 */
import { GUARDRAILS } from './prompts.js';

export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', base: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
  openai: { label: 'OpenAI-compatible endpoint', base: 'https://api.openai.com/v1', model: '' },
};

export function buildRequest({ provider, apiKey, model, baseUrl }, system, user, maxTokens = 1200) {
  if (!apiKey && provider === 'anthropic') throw new Error('Enter an API key first.');
  if (provider === 'anthropic') {
    return {
      url: `${(baseUrl || PROVIDERS.anthropic.base).replace(/\/$/, '')}/v1/messages`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: model || PROVIDERS.anthropic.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      },
    };
  }
  const base = (baseUrl || PROVIDERS.openai.base).replace(/\/$/, '');
  if (!model) throw new Error('Enter the model name your endpoint expects.');
  return {
    url: `${base}/chat/completions`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    },
  };
}

export function readText(provider, json) {
  if (provider === 'anthropic') return (json?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return json?.choices?.[0]?.message?.content || '';
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences and prose). */
export function extractJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  if (start < 0) throw new Error('The model did not return JSON.');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('The model returned incomplete JSON.');
}

export async function callModel(settings, system, user, fetchImpl = globalThis.fetch) {
  const { url, init } = buildRequest(settings, system, user);
  let res;
  try { res = await fetchImpl(url, init); } catch (e) { throw new Error(`Could not reach ${new URL(url).host}. Check the endpoint and your network. (${e.message})`); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `The provider returned HTTP ${res.status}.`);
  return readText(settings.provider, body);
}

// ---------------------------------------------------------------- validation
const PROTECTED = /\b(age|young|old|gender|male|female|man|woman|mother|father|married|nationality|native|ethnic|religio\w*|christian|muslim|jewish|disab\w*|health|pregnan\w*|german citizen|deutsch(e|er)? staatsangeh\w*|jung|alt|frau|mann)\b/i;
export function cleanTerm(t) {
  const s = String(t ?? '').replace(/["“”„()]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 60) return null;
  if (/\b(AND|OR|NOT)\b/.test(s)) return null;
  if (PROTECTED.test(s)) return null;
  return s;
}

export function validateSuggestions(json, existing = []) {
  const have = new Set(existing.map((x) => String(x).toLowerCase()));
  const take = (arr, fn) => (Array.isArray(arr) ? arr : []).map(fn).filter(Boolean).filter((x) => {
    const k = x.term.toLowerCase(); if (have.has(k)) return false; have.add(k); return true;
  }).slice(0, 10);
  const titles = take(json?.titles, (x) => {
    const term = cleanTerm(x?.term); const lang = ['en', 'de', 'pl'].includes(x?.lang) ? x.lang : null;
    return term && lang ? { term, lang, reason: String(x?.reason || '').slice(0, 160) } : null;
  });
  const skills = take(json?.skills, (x) => {
    const term = cleanTerm(x?.term);
    return term ? { term, reason: String(x?.reason || '').slice(0, 160) } : null;
  });
  const risky = (Array.isArray(json?.risky) ? json.risky : []).map((x) => ({ term: cleanTerm(x?.term), reason: String(x?.reason || '').slice(0, 160) })).filter((x) => x.term).slice(0, 8);
  return { titles, skills, risky };
}

const SYSTEM = `You are a senior technical sourcer for manufacturing roles in Germany. You suggest search vocabulary only.\n${GUARDRAILS.map((g) => '- ' + g).join('\n')}\nAnswer with a single JSON object and nothing else.`;

export async function suggestTerms(settings, role, currentString, fetchImpl) {
  const must = role.skills.filter((s) => s.priority === 'must').map((s) => s.name).join(', ');
  const user = `Role: ${role.title}\nMust-have skills: ${must || 'not stated'}\nExisting titles: ${[...role.titles.en, ...role.titles.de].join(', ')}\nCurrent keyword string: ${currentString}\n\nReturn JSON: {"titles":[{"term":"","lang":"en|de|pl","reason":""}],"skills":[{"term":"","reason":""}],"risky":[{"term":"","reason":""}]}\n- titles: up to 6 job titles people with this role use on profiles, English, German or Polish.\n- skills: up to 6 true synonyms or tool names for the must-have skills (not adjacent skills).\n- risky: terms in the current string likely to return irrelevant profiles.`;
  const text = await callModel(settings, SYSTEM, user, fetchImpl);
  const existing = [...role.titles.en, ...role.titles.de, ...role.titles.pl, ...role.skills.flatMap((s) => [s.name, ...Object.values(s.search || {}).flat()])];
  return validateSuggestions(extractJson(text), existing);
}

export async function improveOutreach(settings, { lang, subject, body, role }, fetchImpl) {
  const user = `Improve this first-touch ${lang === 'de' ? 'German (formal "Sie")' : 'English'} recruiting message for the role "${role.title}". Keep every [bracketed placeholder] exactly as it is. Under 110 words, one clear ask, one easy way to say no, no hype words.\n\nSubject: ${subject}\n\n${body}\n\nReturn JSON: {"subject":"","body":""}`;
  const json = extractJson(await callModel(settings, SYSTEM, user, fetchImpl));
  const outSubject = String(json.subject || '').slice(0, 120);
  const outBody = String(json.body || '').slice(0, 2000);
  const placeholders = (body.match(/\[[^\]]+\]/g) || []);
  const kept = placeholders.every((p) => outBody.includes(p) || outSubject.includes(p));
  if (!outBody) throw new Error('The model returned an empty message.');
  return { subject: outSubject || subject, body: outBody, placeholdersKept: kept };
}
