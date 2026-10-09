# CuántoGasta Gasolina

Precio de la gasolina y el diésel hoy en las gasolineras de España: <https://cuantogasta.github.io/gasolina/>

Sitio estático que se actualiza solo tres veces al día con GitHub Actions:

1. `src/fetch.mjs` descarga los precios oficiales (Geoportal de Hidrocarburos, Ministerio para la Transición Ecológica) y guarda las medias diarias en `data/historico.json`.
2. `src/build.mjs` genera unas 3.300 páginas en `dist/`: portada, combustibles, 52 provincias, todos los municipios con gasolinera, marcas, mejor día para repostar, histórico y calculadora.
3. `tools/check.mjs` comprueba enlaces, metadatos y datos antes de publicar.
4. Se publica en GitHub Pages, se avisa a los buscadores (`tools/indexnow.mjs`) y se comprueba que la web tiene precios de hoy (`tools/estado.mjs`). Si no, GitHub envía un correo.

Monetización en `site.config.json`: `amazonTag` (activo), `adsenseClient` (pendiente) y `cloudflareToken` (opcional).

Para probarla en local:

```bash
node src/fetch.mjs
```

```bash
node src/build.mjs
```

```bash
node tools/serve.mjs
```
