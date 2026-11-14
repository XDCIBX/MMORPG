// Показать процедурные текстуры земли (цвет и высоту): tools/terrain/tex.html
import { groundTextures } from '../../src/core/groundtex.js';
const T = groundTextures();
document.body.style.cssText = 'margin:0;background:#222;display:flex;flex-wrap:wrap;';
for (const k of ['grass', 'dirt', 'rock', 'sand', 'gravel']) {
  const t = T[k], S = t.image.width;
  for (const mode of ['col', 'h']) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), img = x.createImageData(S, S), d = t.image.data;
    for (let i = 0; i < S * S; i++) {
      if (mode === 'col') { img.data[i * 4] = d[i * 4]; img.data[i * 4 + 1] = d[i * 4 + 1]; img.data[i * 4 + 2] = d[i * 4 + 2]; }
      else { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = d[i * 4 + 3]; }
      img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    c.style.cssText = 'width:256px;height:256px;margin:2px';
    document.body.appendChild(c);
  }
}
window.__ms = T.ms;
window.__ready = true;
