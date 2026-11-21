/**
 * Role-specific prompt library for AI-assisted sourcing.
 *
 * Prompts are designed to be pasted into an approved internal AI platform. Each
 * one states its inputs, the expected output format and guardrails, so results
 * are reviewable and consistent across recruiters.
 */

export const GUARDRAILS = [
  'Use only the information provided. If something is not stated, write "not stated" instead of guessing.',
  'Do not infer or mention age, gender, nationality, ethnicity, religion, disability, family status, health or any other protected characteristic.',
  'Do not rank or score people. Summarise evidence against job requirements only.',
  'Do not invent facts about the employer, team, salary or benefits.',
  'Flag anything that needs a human check with [VERIFY].',
];

const list = (xs) => xs.map((x) => `- ${x}`).join('\n');
const guard = () => `Guardrails:\n${list(GUARDRAILS)}`;

export function promptLibrary(role) {
  const must = role.skills.filter((s) => s.priority === 'must' && !s.contextOnly).map((s) => s.name);
  const nice = role.skills.filter((s) => s.priority === 'nice').map((s) => s.name);
  const titles = [...(role.titles.en || []), ...(role.titles.de || [])].slice(0, 8);
  const ctx = [
    `Role: ${role.title}`,
    `Location: Grünheide near Berlin (Berlin-Brandenburg)`,
    `Must-have skills: ${must.join(', ') || 'not stated'}`,
    `Nice-to-have skills: ${nice.join(', ') || 'none listed'}`,
    `Known title variants: ${titles.join(', ') || 'not stated'}`,
  ].join('\n');

  return [
    {
      id: 'boolean-review', title: 'Review and extend a Boolean search', when: 'Before running a new search',
      prompt: `You are an experienced technical sourcer in Germany.\n\n${ctx}\n\nCurrent LinkedIn Recruiter keyword string:\n<<PASTE STRING>>\n\nTasks:\n1. List up to 8 additional job titles people in this role use on LinkedIn and XING, in English, German and Polish. Mark each with its language.\n2. List up to 8 additional skill or tool synonyms. Only include terms that mean the same thing, not adjacent skills.\n3. Point out any term in the current string that is likely to pull in irrelevant profiles, and why.\n4. Return a corrected string using AND / OR / NOT in capitals and straight quotes.\n\nOutput as a table (term | language | type | reason), then the corrected string.\n\n${guard()}`,
    },
    {
      id: 'talent-map', title: 'Talent map research', when: 'When a role is new or hard to fill',
      prompt: `You are helping build a talent map for a hard-to-fill role.\n\n${ctx}\n\nTasks:\n1. Which industries and types of employers within 90 minutes of Grünheide typically employ people with these must-have skills? Give examples of employers and say what they do.\n2. Which universities, vocational schools or training programmes in Berlin, Brandenburg and western Poland produce these skills?\n3. Which adjacent roles could transfer into this role with short training? Explain the skill overlap.\n4. For every factual claim, add the source you would use to verify it, and mark claims you are unsure about with [VERIFY].\n\nOutput: three short tables (employers, schools, adjacent roles), then a list of open questions for the hiring manager.\n\n${guard()}`,
    },
    {
      id: 'profile-summary', title: 'Summarise a profile against the must-haves', when: 'After a search, before outreach',
      prompt: `${ctx}\n\nProfile text (public profile only; remove name and contact details first):\n<<PASTE PROFILE TEXT>>\n\nFor each must-have skill, quote the exact words in the profile that show evidence of it, or write "not stated". Then list up to three questions the recruiter should ask in a screening call to close the gaps.\n\nOutput as a table: requirement | evidence (quote) | open question.\n\n${guard()}`,
    },
    {
      id: 'outreach', title: 'Personalise a first message (DE / EN)', when: 'Drafting first-touch outreach',
      prompt: `Write a first LinkedIn message for this role, in German (formal "Sie") and in English.\n\n${ctx}\n\nWhat the recruiter noticed in the profile (one point):\n<<ONE SPECIFIC POINT>>\n\nWhat the recruiter can truthfully say about the team or project:\n<<ONE VERIFIED FACT>>\n\nRules: under 110 words each, one specific reason why this person, one clear ask for a 15-minute call, one sentence that makes it easy to say no, no hype words, at most one exclamation mark.\n\n${guard()}`,
    },
    {
      id: 'screening-guide', title: 'Screening call guide', when: 'Preparing a first call',
      prompt: `Create a 20-minute screening call guide for this role.\n\n${ctx}\n\nInclude: a two-sentence opening that explains the role and next steps, one behavioural question per must-have skill (ask for a concrete example), practical questions (shift model, notice period, commute or relocation, language), and space for the candidate's questions. Keep every question job-related and identical for all candidates.\n\nOutput as a checklist with timings.\n\n${guard()}`,
    },
    {
      id: 'funnel-insights', title: 'Turn funnel numbers into actions', when: 'Weekly sourcing review',
      prompt: `You are reviewing a weekly sourcing funnel for "${role.title}".\n\nFunnel table (paste from the ScoutForge Excel "Funnel" sheet):\n<<PASTE TABLE>>\n\nTasks:\n1. Describe what changed versus last week in plain language.\n2. Identify the weakest stage and the best-performing channel, using only the numbers given.\n3. Suggest up to three experiments for next week (e.g. new title variant, different channel, different message) and how to measure each.\nDo not invent numbers. If the sample is too small to conclude anything, say so.\n\n${guard()}`,
    },
  ];
}

export function promptLibraryMarkdown(role) {
  const items = promptLibrary(role);
  return [`# Prompt library: ${role.title}`, '', 'Generated by ScoutForge. Paste into an approved AI platform; review every output before use.', '',
    ...items.flatMap((p) => [`## ${p.title}`, `_When:_ ${p.when}`, '', '```text', p.prompt, '```', ''])].join('\n');
}
