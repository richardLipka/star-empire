#!/usr/bin/env node
// @ts-check
/**
 * Build src/data/stars.json from the HYG Database.
 *
 *   npm run catalog                       # download HYG v4.1, radius 50 ly
 *   npm run catalog -- --radius 80        # larger map
 *   npm run catalog -- --input hyg.csv    # use a local copy
 *
 * The HYG Database (David Nash, astronexus) is licensed CC BY-SA 4.0.
 * The generated file is a derivative work under the same license.
 * Behind a proxy, run with NODE_USE_ENV_PROXY=1.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HYG_VERSION = '4.1';
const HYG_URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';
const LY_PER_PC = 3.261563777;
/** Stars closer than this to a system's primary are merged into that system (ly). Keeps Proxima with Alpha Centauri. */
const MERGE_LY = 0.3;

/** Equatorial (J2000) to galactic rotation. Galactic x → centre, y → rotation, z → north pole. */
const EQ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];

/** Traditional names for systems whose primary's proper name is not the usual system name. */
const SYSTEM_NAME_OVERRIDES = {
  'Rigil Kentaurus': 'Alpha Centauri',
  Ran: 'Epsilon Eridani',
  Keid: '40 Eridani',
};

/** Constellation abbreviation → genitive, for names such as "Tau Ceti" or "61 Cygni". */
const GENITIVE = {
  And: 'Andromedae', Ant: 'Antliae', Aps: 'Apodis', Aqr: 'Aquarii', Aql: 'Aquilae', Ara: 'Arae', Ari: 'Arietis',
  Aur: 'Aurigae', Boo: 'Bootis', Cae: 'Caeli', Cam: 'Camelopardalis', Cnc: 'Cancri', CVn: 'Canum Venaticorum',
  CMa: 'Canis Majoris', CMi: 'Canis Minoris', Cap: 'Capricorni', Car: 'Carinae', Cas: 'Cassiopeiae', Cen: 'Centauri',
  Cep: 'Cephei', Cet: 'Ceti', Cha: 'Chamaeleontis', Cir: 'Circini', Col: 'Columbae', Com: 'Comae Berenices',
  CrA: 'Coronae Australis', CrB: 'Coronae Borealis', Crv: 'Corvi', Crt: 'Crateris', Cru: 'Crucis', Cyg: 'Cygni',
  Del: 'Delphini', Dor: 'Doradus', Dra: 'Draconis', Equ: 'Equulei', Eri: 'Eridani', For: 'Fornacis', Gem: 'Geminorum',
  Gru: 'Gruis', Her: 'Herculis', Hor: 'Horologii', Hya: 'Hydrae', Hyi: 'Hydri', Ind: 'Indi', Lac: 'Lacertae',
  Leo: 'Leonis', LMi: 'Leonis Minoris', Lep: 'Leporis', Lib: 'Librae', Lup: 'Lupi', Lyn: 'Lyncis', Lyr: 'Lyrae',
  Men: 'Mensae', Mic: 'Microscopii', Mon: 'Monocerotis', Mus: 'Muscae', Nor: 'Normae', Oct: 'Octantis',
  Oph: 'Ophiuchi', Ori: 'Orionis', Pav: 'Pavonis', Peg: 'Pegasi', Per: 'Persei', Phe: 'Phoenicis', Pic: 'Pictoris',
  Psc: 'Piscium', PsA: 'Piscis Austrini', Pup: 'Puppis', Pyx: 'Pyxidis', Ret: 'Reticuli', Sge: 'Sagittae',
  Sgr: 'Sagittarii', Sco: 'Scorpii', Scl: 'Sculptoris', Sct: 'Scuti', Ser: 'Serpentis', Sex: 'Sextantis', Tau: 'Tauri',
  Tel: 'Telescopii', Tri: 'Trianguli', TrA: 'Trianguli Australis', Tuc: 'Tucanae', UMa: 'Ursae Majoris',
  UMi: 'Ursae Minoris', Vel: 'Velorum', Vir: 'Virginis', Vol: 'Volantis', Vul: 'Vulpeculae',
};
const constellation = (con) => GENITIVE[con] ?? con;

const GREEK = {
  Alp: 'Alpha', Bet: 'Beta', Gam: 'Gamma', Del: 'Delta', Eps: 'Epsilon', Zet: 'Zeta', Eta: 'Eta', The: 'Theta',
  Iot: 'Iota', Kap: 'Kappa', Lam: 'Lambda', Mu: 'Mu', Nu: 'Nu', Xi: 'Xi', Omi: 'Omicron', Pi: 'Pi', Rho: 'Rho',
  Sig: 'Sigma', Tau: 'Tau', Ups: 'Upsilon', Phi: 'Phi', Chi: 'Chi', Psi: 'Psi', Ome: 'Omega',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { radius: Number(get('radius') ?? 50), input: get('input'), out: get('out') ?? join(root, 'src/data/stars.json') };
}

/** Minimal CSV parser for HYG (quoted fields, no embedded newlines). @param {string} line */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function loadCsv(input) {
  if (input) return readFile(input, 'utf8');
  const cache = join(root, 'tools/.cache', `hygdata_v${HYG_VERSION.replace('.', '')}.csv`);
  if (existsSync(cache)) return readFile(cache, 'utf8');
  console.log(`Downloading ${HYG_URL}`);
  const res = await fetch(HYG_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, text);
  return text;
}

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const clean = (s) => s.replace(/\s+/g, ' ').trim();

/** Readable star designation. */
function starName(r) {
  if (r.proper) return r.proper;
  if (r.bayer && r.con) {
    const [letter, idx] = r.bayer.split('-');
    return `${GREEK[letter] ?? letter}${idx ? `-${idx}` : ''} ${constellation(r.con)}`;
  }
  if (r.flam && r.con) return `${r.flam} ${constellation(r.con)}`;
  if (r.gl) return clean(r.gl);
  if (r.hip) return `HIP ${r.hip}`;
  if (r.hd) return `HD ${r.hd}`;
  return `HYG ${r.id}`;
}

/** Spectral class letter: O B A F G K M, D for white dwarfs, ? if unknown. */
function spectralClass(spect) {
  const s = spect.replace(/^(sd|d|esd)/, '').toUpperCase();
  const c = s[0];
  if (c === 'D' || spect.startsWith('D')) return 'D';
  return 'OBAFGKM'.includes(c) ? c : '?';
}

function toGalactic(x, y, z) {
  return EQ_TO_GAL.map((row) => row[0] * x + row[1] * y + row[2] * z);
}

async function main() {
  const { radius, input, out } = parseArgs();
  const lines = (await loadCsv(input)).split(/\r?\n/).filter(Boolean);
  const header = splitCsv(lines[0]);
  const rows = lines.slice(1).map((l) => Object.fromEntries(splitCsv(l).map((v, i) => [header[i], v])));

  const stars = rows
    .map((r) => {
      const distPc = Number(r.dist);
      const pos = toGalactic(Number(r.x), Number(r.y), Number(r.z)).map((v) => v * LY_PER_PC);
      return { r, distLy: distPc * LY_PER_PC, pos, valid: distPc < 100000 };
    })
    .filter((s) => s.valid && s.distLy <= radius)
    .sort((a, b) => a.distLy - b.distLy);

  // Group by HYG multiple-star membership, then merge close neighbours into the brighter group.
  const groups = new Map();
  for (const s of stars) {
    const key = s.r.comp_primary || s.r.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const primaryOf = (members) => members.find((m) => m.r.id === m.r.comp_primary) ?? members[0];
  const list = [...groups.values()].map((members) => ({ members, primary: primaryOf(members) }));
  list.sort((a, b) => Number(a.primary.r.absmag) - Number(b.primary.r.absmag)); // brightest first absorbs
  const merged = [];
  for (const g of list) {
    const host = merged.find((m) => Math.hypot(...m.primary.pos.map((v, i) => v - g.primary.pos[i])) < MERGE_LY);
    if (host) host.members.push(...g.members);
    else merged.push(g);
  }

  const systems = merged
    .map(({ members, primary }) => {
      const p = primary.r;
      // Prefer a proper name, then Bayer/Flamsteed, then the catalogue base designation; drop component letters.
      const named = p.proper || ((p.bayer || p.flam) && p.con ? starName(p) : '');
      const baseName = (named || (p.base ? clean(p.base) : '') || starName(p)).replace(/(\S)\s?[A-C]$/, '$1');
      const name = SYSTEM_NAME_OVERRIDES[baseName] ?? baseName;
      const ordered = [primary, ...members.filter((m) => m !== primary)];
      return {
        id: p.id === '0' ? 'sol' : `hyg-${p.id}`,
        name: p.id === '0' ? 'Sol' : name,
        pos: primary.pos.map((v) => round(v)),
        dist: round(primary.distLy),
        stars: ordered.map(({ r }) => ({
          name: starName(r),
          spect: clean(r.spect) || '?',
          cls: spectralClass(clean(r.spect)),
          absmag: round(Number(r.absmag), 2),
          lum: round(Number(r.lum), 5),
        })),
      };
    })
    .sort((a, b) => a.dist - b.dist);

  const catalog = {
    meta: {
      source: `HYG Database v${HYG_VERSION}`,
      author: 'David Nash (astronexus)',
      url: 'https://github.com/astronexus/HYG-Database',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      note: 'Derived: filtered by distance, converted to galactic coordinates in light-years, multiple stars grouped into systems.',
      frame: 'galactic; x toward galactic centre, y toward galactic rotation, z toward north galactic pole; light-years; Sol at origin',
      radiusLy: radius,
      systemCount: systems.length,
      starCount: systems.reduce((n, s) => n + s.stars.length, 0),
    },
    systems,
  };

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(catalog));
  console.log(`Wrote ${catalog.meta.systemCount} systems (${catalog.meta.starCount} stars) within ${radius} ly to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
