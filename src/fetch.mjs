// Descarga los precios de hoy y mantiene el histórico de medias diarias.
//   node src/fetch.mjs                -> precios en vivo + cierre oficial de ayer si falta
//   node src/fetch.mjs historico 180  -> rellena los días que falten de los últimos 180 (cierre oficial de cada día)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, normalizar, agregar, descargar, fechaApi } from './datos.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const HIST = path.join(DATA, 'historico.json');
fs.mkdirSync(DATA, { recursive: true });

const leer = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : def);
const historico = leer(HIST, {});
const guardarHist = () => {
  const orden = Object.fromEntries(Object.keys(historico).sort().map((k) => [k, historico[k]]));
  fs.writeFileSync(HIST, JSON.stringify(orden));
};

const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dmy = (iso) => iso.split('-').reverse().join('-');

async function cierre(fecha) {
  const j = await descargar(`${API}/EstacionesTerrestresHist/${dmy(fecha)}`);
  const est = normalizar(j);
  if (est.length < 5000) throw new Error(`Solo ${est.length} gasolineras para ${fecha}`);
  historico[fecha] = { ...agregar(est), fuente: 'cierre' };
  return est.length;
}

const modo = process.argv[2];
if (modo === 'historico') {
  const dias = Number(process.argv[3] || 120);
  const hoy = hoyMadrid();
  for (let k = dias; k >= 1; k--) {
    const f = sumar(hoy, -k);
    if (historico[f]?.fuente === 'cierre') continue;
    try {
      const n = await cierre(f);
      guardarHist();
      console.log(`${f}: ${n} gasolineras`);
    } catch (e) {
      console.log(`${f}: ERROR ${e.message}`);
    }
  }
} else {
  const j = await descargar(`${API}/EstacionesTerrestres/`);
  const est = normalizar(j);
  if (est.length < 5000) throw new Error(`Solo ${est.length} gasolineras: la respuesta parece incompleta`);
  const f = fechaApi(j.Fecha) || { fecha: hoyMadrid(), hora: '' };
  fs.writeFileSync(path.join(DATA, 'estaciones.json'), JSON.stringify({ fecha: f.fecha, hora: f.hora, estaciones: est }));
  if (historico[f.fecha]?.fuente !== 'cierre') historico[f.fecha] = { ...agregar(est), fuente: 'vivo', hora: f.hora };
  // cierre oficial de los últimos días que falten (máx. 3 por ejecución para no cargar la API)
  let pendientes = 0;
  for (let k = 1; k <= 7 && pendientes < 3; k++) {
    const d = sumar(f.fecha, -k);
    if (historico[d]?.fuente === 'cierre') continue;
    pendientes++;
    try { await cierre(d); } catch (e) { console.log(`Cierre de ${d} no disponible: ${e.message}`); }
  }
  guardarHist();
  console.log(`${est.length} gasolineras · datos del ${f.fecha} a las ${f.hora} · ${Object.keys(historico).length} días en el histórico`);
}
