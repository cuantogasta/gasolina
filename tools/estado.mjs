// Comprueba la web publicada. Si los precios tienen más de un día, termina con error para que
// GitHub envíe un correo de aviso al propietario del repositorio (la web sigue funcionando con los últimos datos).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const URL_BASE = CFG.siteUrl.replace(/\/$/, '') + CFG.base;

const res = await fetch(`${URL_BASE}/datos/resumen.json?t=${Date.now()}`);
if (!res.ok) { console.error(`::error::La web no responde (${res.status}) en ${URL_BASE}/`); process.exit(1); }
const r = await res.json();
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dias = (Date.parse(hoy) - Date.parse(r.fecha)) / 864e5;
if (dias > 1) {
  console.error(`::error::Los precios publicados son del ${r.fecha} (hoy es ${hoy}). Puede que la API del Ministerio haya cambiado o esté caída.`);
  process.exit(1);
}
console.log(`Estado OK: precios del ${r.fecha} a las ${r.hora} · gasolina 95 ${r.media.g95} €/l · diésel ${r.media.die} €/l`);
