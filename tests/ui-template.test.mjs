// Gabarit h`` (public/ui.js) : tout est échappé ; un booléen dans un attribut ARIA vaut « true » ou « false »
// (avant : false donnait un attribut vide, illisible par les lecteurs d'écran) ; ailleurs false n'affiche rien.
import assert from 'node:assert/strict';
import { h, seg, chip, meter } from '../public/ui.js';
import { ok, done } from './helpers.mjs';

await ok('booléens : « true » / « false » dans les attributs ARIA, rien ailleurs', () => {
  assert.equal(h`<b aria-checked="${false}" aria-pressed="${true}">${false}</b>`.s, '<b aria-checked="false" aria-pressed="true"></b>');
  assert.equal(h`<i data-x="${false}">${true}</i>`.s, '<i data-x="">true</i>', 'hors ARIA : comportement inchangé');
  assert.match(seg('x', 'b', [['a', 'A'], ['b', 'B']]).s, /aria-checked="false"[^>]*>A<[\s\S]*aria-checked="true"[^>]*>B</);
  assert.match(chip(false, 'Off', 'data-act="y"').s, /aria-pressed="false"/);
});
await ok('jauges : un nom lu par les lecteurs d’écran, échappé', () => {
  assert.match(meter(40, '', 'Bilan <physique>').s, /role="progressbar" aria-label="Bilan &lt;physique&gt;" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40"/);
  assert.match(meter(10).s, /aria-label="Progression"/);
});
await ok('échappement toujours appliqué', () => {
  assert.equal(h`<p title="${'"><script>'}">${'<img src=x onerror=1>'}</p>`.s, '<p title="&quot;&gt;&lt;script&gt;">&lt;img src=x onerror=1&gt;</p>');
});
done('tests gabarit (ARIA, jauges, échappement)');
