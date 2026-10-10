// Descarga y normalización de los precios oficiales de carburantes (Ministerio para la Transición Ecológica,
// Geoportal de Hidrocarburos). API REST pública, sin clave: se actualiza cada media hora.
export const API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';

export const COMBUSTIBLES = [
  { id: 'g95', campo: 'Precio Gasolina 95 E5', nombre: 'Gasolina 95', largo: 'gasolina 95 (sin plomo)', slug: 'precio-gasolina-95' },
  { id: 'die', campo: 'Precio Gasoleo A', nombre: 'Diésel', largo: 'gasóleo A (diésel)', slug: 'precio-diesel' },
  { id: 'g98', campo: 'Precio Gasolina 98 E5', nombre: 'Gasolina 98', largo: 'gasolina 98', slug: 'precio-gasolina-98' },
  { id: 'glp', campo: 'Precio Gases licuados del petróleo', nombre: 'GLP', largo: 'GLP o autogás', slug: 'precio-glp-autogas' },
];

// Provincias por código INE (el campo IDProvincia de la API).
export const PROVINCIAS = {
  '01': 'Araba/Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz', '07': 'Illes Balears',
  '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba',
  '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva',
  '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga',
  '30': 'Murcia', '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla', '42': 'Soria',
  '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Bizkaia', '49': 'Zamora',
  '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

export function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'i', 'e', 'en', 'a', 'o', 'da', 'do', 'das', 'dos', 'd', 'l']);
export function titulo(s) {
  return String(s).toLowerCase().split(/(\s+|-|\/)/).map((w, i) => {
    if (!w.trim() || w === '-' || w === '/') return w;
    if (i > 0 && MINUSCULAS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('').replace(/\b(L|D)'(\w)/g, (_, a, b) => `${a}'${b.toUpperCase()}`);
}

// «Coruña (A)» -> «A Coruña»; «Palmas de Gran Canaria (Las)» -> «Las Palmas de Gran Canaria»; «Escala (L')» -> «L'Escala»
export function nombreMunicipio(s) {
  const m = String(s).trim().match(/^(.*)\s+\(([^)]+)\)$/);
  if (!m) return s.trim();
  const art = m[2].trim();
  return art.endsWith("'") ? `${art}${m[1]}` : `${art} ${m[1]}`;
}

const num = (s) => {
  if (!s) return null;
  const v = parseFloat(String(s).replace(',', '.'));
  return v >= 0.6 && v <= 3.5 ? v : null; // descarta errores de carga evidentes
};

// Las marcas se agrupan por su nombre comercial (el campo Rótulo es texto libre).
const MARCAS = ['REPSOL', 'MOEVE', 'CEPSA', 'GALP', 'BALLENOIL', 'PLENERGY', 'SHELL', 'PETROPRIX', 'PETRONOR', 'CARREFOUR', 'BP', 'AVIA',
  'Q8', 'ESCLATOIL', 'BONAREA', 'PLENOIL', 'ALCAMPO', 'EROSKI', 'DISA', 'CAMPSA', 'GASEXPRESS', 'MEROIL', 'AUTONETOIL', 'VALCARCE',
  'PCAN', 'PETROCAT', 'TAMOIL', 'LOW COST REPOST', 'COSTCO', 'E.LECLERC', 'HAM', 'NATURGY', 'SIMON GRUP', 'ENERGY CARBURANTES'];
// rótulos que en realidad significan «sin marca» (el Ministerio usa «NINGUNO» para las gasolineras independientes)
const SIN_ROTULO = /^(NINGUN[OA]|SIN (ROTULO|RÓTULO|MARCA|DETERMINAR|ASIGNAR)|S\/?R|N\/?A|NO|SI|-+|\.+)$/;
export function marca(rotulo) {
  const r = String(rotulo || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!r || SIN_ROTULO.test(r)) return 'Sin marca';
  if (r.startsWith('BON') && r.includes('AREA')) return 'BONAREA';
  if (r.includes('CEPSA')) return 'CEPSA';
  if (r.includes('MOEVE')) return 'MOEVE';
  const m = MARCAS.find((b) => r === b || r.startsWith(b + ' ') || r.startsWith(b + '-'));
  return m || r;
}
export const NOMBRE_MARCA = {
  REPSOL: 'Repsol', MOEVE: 'Moeve (antes Cepsa)', CEPSA: 'Cepsa', GALP: 'Galp', BALLENOIL: 'Ballenoil', PLENERGY: 'Plenergy', SHELL: 'Shell',
  PETROPRIX: 'Petroprix', PETRONOR: 'Petronor', CARREFOUR: 'Carrefour', BP: 'BP', AVIA: 'Avia', Q8: 'Q8', ESCLATOIL: 'Esclatoil',
  BONAREA: 'bonÀrea', PLENOIL: 'Plenoil', ALCAMPO: 'Alcampo', EROSKI: 'Eroski', DISA: 'Disa', CAMPSA: 'Campsa', GASEXPRESS: 'GasExpress',
  MEROIL: 'Meroil', AUTONETOIL: 'Autonetoil', VALCARCE: 'Valcarce', PCAN: 'PCAN', PETROCAT: 'Petrocat', TAMOIL: 'Tamoil',
  'LOW COST REPOST': 'Low Cost Repost', COSTCO: 'Costco', 'E.LECLERC': 'E.Leclerc', HAM: 'HAM', NATURGY: 'Naturgy',
  'SIMON GRUP': 'Simon Grup', 'ENERGY CARBURANTES': 'Energy Carburantes',
};
export const nombreMarca = (m) => NOMBRE_MARCA[m] || titulo(m);

// «CALLE CALLE DE LADERA, 34» -> «Calle de Ladera, 34»; quita comas y espacios sobrantes al final
export function limpiarDireccion(s) {
  return titulo(String(s || '').trim())
    .replace(/^(Calle|Avenida|Avda\.?|Carretera|Ctra\.?|Plaza|Paseo|Camino)\s+(Calle|Avenida|Avda\.?|Carretera|Ctra\.?|Plaza|Paseo|Camino)\b/i, '$2')
    .replace(/\s+,/g, ',').replace(/[,\s]+$/, '').replace(/\s{2,}/g, ' ');
}

/** Convierte la respuesta de la API en una lista compacta de gasolineras abiertas al público. */
export function normalizar(json) {
  const out = [];
  for (const e of json.ListaEESSPrecio || []) {
    if ((e['Tipo Venta'] || 'P') !== 'P') continue; // «R»: venta restringida a socios, no sirve para comparar
    const precios = {};
    for (const c of COMBUSTIBLES) {
      const v = num(e[c.campo]);
      if (v) precios[c.id] = v;
    }
    if (!Object.keys(precios).length) continue;
    const prov = e.IDProvincia;
    if (!PROVINCIAS[prov]) continue;
    const mun = nombreMunicipio(e.Municipio);
    out.push({
      id: e.IDEESS,
      marca: marca(e['Rótulo']),
      rotulo: titulo(String(e['Rótulo'] || '').trim()) || 'Gasolinera',
      dir: limpiarDireccion(e['Dirección']),
      cp: e['C.P.'],
      loc: nombreMunicipio(titulo(e.Localidad || '')),
      mun,
      munId: e.IDMunicipio,
      prov,
      lat: parseFloat(String(e.Latitud).replace(',', '.')),
      lon: parseFloat(String(e['Longitud (WGS84)']).replace(',', '.')),
      horario: String(e.Horario || '').trim(),
      p: precios,
    });
  }
  return out;
}

export const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
export const r3 = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);

/** Resumen de un día: medias nacionales, por provincia y por marca. Ocupa unos pocos KB por día. */
export function agregar(estaciones) {
  const nac = {};
  const prov = {};
  const marcas = {};
  for (const c of COMBUSTIBLES) {
    nac[c.id] = r3(media(estaciones.map((e) => e.p[c.id]).filter(Boolean)));
  }
  for (const code of Object.keys(PROVINCIAS)) {
    const est = estaciones.filter((e) => e.prov === code);
    prov[code] = {};
    for (const c of ['g95', 'die']) prov[code][c] = r3(media(est.map((e) => e.p[c]).filter(Boolean)));
    prov[code].n = est.length;
  }
  const porMarca = {};
  for (const e of estaciones) (porMarca[e.marca] ||= []).push(e);
  for (const [m, est] of Object.entries(porMarca)) {
    if (est.length < 25 || m === 'Sin marca') continue;
    marcas[m] = { g95: r3(media(est.map((e) => e.p.g95).filter(Boolean))), die: r3(media(est.map((e) => e.p.die).filter(Boolean))), n: est.length };
  }
  return { nac, prov, marcas, n: estaciones.length };
}

export async function descargar(url, intentos = 4) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'cuantogasta-gasolina (+https://cuantogasta.github.io/gasolina/)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.ResultadoConsulta !== 'OK') throw new Error(`Resultado: ${j.ResultadoConsulta}`);
      return j;
    } catch (e) {
      ultimo = e;
      await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
    }
  }
  throw ultimo;
}

// «09/10/2026 15:50:25» -> { fecha: '2026-10-09', hora: '15:50' }
export function fechaApi(s) {
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  return m ? { fecha: `${m[3]}-${m[2]}-${m[1]}`, hora: `${m[4].padStart(2, '0')}:${m[5]}` } : null;
}
