/**
 * Talent-map seed data for Berlin-Brandenburg.
 *
 * This is an EDITORIAL starting list (reviewed November 2026), not market data:
 * no headcounts, no availability, no rankings. Sourcers edit it, and ScoutForge
 * turns the selection into company- and location-targeted searches.
 */
import { orGroup, quote, GOOGLE_WORD_LIMIT, countGoogleWords, titleTerms } from './boolean.js';

export const MARKET_REVIEWED = '2026-11';

export const LOCATION_TIERS = [
  { id: 'core', label: 'Core commute (≈ up to 45 min)', places: ['Berlin', 'Grünheide', 'Erkner', 'Fürstenwalde', 'Strausberg', 'Königs Wusterhausen'] },
  { id: 'regional', label: 'Regional (≈ 45–90 min)', places: ['Frankfurt (Oder)', 'Eberswalde', 'Potsdam', 'Cottbus', 'Brandenburg'] },
  { id: 'cross-border', label: 'Cross-border Poland', places: ['Słubice', 'Gorzów Wielkopolski', 'Szczecin', 'Poznań'], note: 'Polish profiles: switch on Polish titles.' },
];

/** Which employer and school lists fit a job family. */
const FAMILY_GROUP = {
  'maintenance-technician': 'industrial', 'automation-engineer': 'industrial', 'robotics-engineer': 'industrial',
  'process-engineer': 'industrial', 'quality-engineer': 'industrial', 'production-associate': 'industrial',
  'shift-lead': 'industrial', 'electrical-engineer': 'industrial', 'mechanical-engineer': 'industrial', ehs: 'industrial',
  logistics: 'logistics', 'supply-chain': 'logistics',
  'software-engineer': 'tech', 'data-analyst': 'tech', 'data-engineer': 'tech', 'ml-engineer': 'tech',
  recruiter: 'people', 'hr-generalist': 'people', intern: 'students',
};

export const EMPLOYERS = {
  industrial: [
    { name: 'Rolls-Royce', where: 'Dahlewitz', why: 'aero-engine manufacturing and test' },
    { name: 'Mercedes-Benz', where: 'Ludwigsfelde', why: 'vehicle plant' },
    { name: 'BMW', where: 'Berlin-Spandau', why: 'motorcycle plant' },
    { name: 'Alstom', where: 'Hennigsdorf', why: 'rail vehicle production' },
    { name: 'Stadler', where: 'Berlin-Pankow', why: 'rail vehicle production' },
    { name: 'Siemens Energy', where: 'Berlin', why: 'gas turbine manufacturing' },
    { name: 'BASF', where: 'Schwarzheide', why: 'chemicals and battery materials' },
    { name: 'LEAG', where: 'Lausitz', why: 'energy, heavy maintenance' },
    { name: 'Deutsche Bahn', where: 'Cottbus', why: 'rail maintenance works' },
  ],
  logistics: [
    { name: 'DHL', where: 'Berlin-Brandenburg', why: 'contract logistics and hubs' },
    { name: 'DB Schenker', where: 'Berlin-Brandenburg', why: 'contract logistics' },
    { name: 'Amazon', where: 'Berlin-Brandenburg', why: 'fulfilment centres' },
    { name: 'Rhenus', where: 'Berlin-Brandenburg', why: 'contract logistics' },
  ],
  tech: [
    { name: 'Zalando', where: 'Berlin', why: 'e-commerce engineering' },
    { name: 'Delivery Hero', where: 'Berlin', why: 'platform engineering' },
    { name: 'SAP', where: 'Berlin', why: 'enterprise software' },
    { name: 'Siemens', where: 'Berlin', why: 'industrial software and automation' },
    { name: 'Bosch', where: 'Berlin', why: 'IoT and software' },
    { name: 'N26', where: 'Berlin', why: 'fintech engineering' },
  ],
  people: [
    { name: 'Zalando', where: 'Berlin', why: 'large in-house talent acquisition' },
    { name: 'Siemens', where: 'Berlin', why: 'industrial recruiting' },
    { name: 'Deutsche Bahn', where: 'Berlin', why: 'high-volume technical hiring' },
    { name: 'Amazon', where: 'Berlin-Brandenburg', why: 'high-volume operations hiring' },
  ],
  students: [],
};

export const SCHOOLS = {
  industrial: ['TU Berlin', 'Berliner Hochschule für Technik', 'HTW Berlin', 'TH Wildau', 'BTU Cottbus-Senftenberg', 'Hochschule für nachhaltige Entwicklung Eberswalde'],
  logistics: ['TH Wildau', 'HTW Berlin', 'Europa-Universität Viadrina'],
  tech: ['TU Berlin', 'HU Berlin', 'FU Berlin', 'HTW Berlin', 'Universität Potsdam', 'Hasso-Plattner-Institut'],
  people: ['Europa-Universität Viadrina', 'HTW Berlin', 'HWR Berlin'],
  students: ['TU Berlin', 'HU Berlin', 'FU Berlin', 'HTW Berlin', 'BTU Cottbus-Senftenberg', 'TH Wildau', 'Europa-Universität Viadrina'],
};
export const POLISH_SCHOOLS = ['Politechnika Poznańska', 'Zachodniopomorski Uniwersytet Technologiczny'];

/** Channels: where a sourcer would look beyond LinkedIn, per group. */
export const CHANNELS = {
  industrial: ['LinkedIn Recruiter', 'XING (strong for vocational and technical profiles in DACH)', 'Bundesagentur für Arbeit Jobbörse', 'IHK and Handwerkskammer networks for trained Mechatroniker / Elektroniker', 'Referrals from current shift teams'],
  logistics: ['Job boards (Indeed, StepStone)', 'Bundesagentur für Arbeit Jobbörse', 'Referrals', 'Polish job boards for cross-border candidates'],
  tech: ['LinkedIn Recruiter', 'GitHub X-ray for open-source contributors', 'Berlin tech meetups', 'University career services'],
  people: ['LinkedIn Recruiter', 'XING', 'HR and recruiting communities in Berlin'],
  students: ['University career services and job portals', 'LinkedIn (filter: current students)', 'Student initiatives (e.g. Formula Student teams)'],
};

export function marketFor(familyId) {
  const group = FAMILY_GROUP[familyId] || 'industrial';
  return {
    group,
    employers: EMPLOYERS[group] || [],
    schools: SCHOOLS[group] || [],
    channels: CHANNELS[group] || [],
  };
}

/**
 * Company-targeted X-ray: titles at selected employers, in selected places.
 * Kept inside Google's word budget by trimming employers first.
 */
export function companyXray({ titles, langs, employers, places }) {
  let comps = employers.slice(0, 6);
  let t = titleTerms(titles, langs, 5);
  const p = places.slice(0, 3);
  const make = () => ['site:linkedin.com/in', orGroup(t), orGroup(comps), orGroup(p)].filter(Boolean).join(' ');
  let q = make();
  while (countGoogleWords(q) > GOOGLE_WORD_LIMIT && (comps.length > 2 || t.length > 2)) {
    if (comps.length > 2) comps = comps.slice(0, -1); else t = t.slice(0, -1);
    q = make();
  }
  return q;
}

/** LinkedIn Recruiter "Companies" filter list, one per line, ready to paste. */
export const companyFilter = (employers) => employers.map((e) => e).join('\n');
export const schoolXray = (titles, langs, schools) =>
  ['site:linkedin.com/in', orGroup(titleTerms(titles, langs, 4)), orGroup(schools.slice(0, 4).map(quote).map((x) => x.replace(/"/g, '')))].join(' ');
