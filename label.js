// Dibujo de la etiqueta Feel Foods (80 x 90 mm) como SVG en puntos (pt).
// Medidas tomadas del PDF original "Feelfoods etiquetas_actualizacion Junio.pdf".
(function () {
  const W = 226.772, H = 255.118, CX = W / 2;
  const FONT = { light: 'FFLight', regular: 'FFRegular', semibold: 'FFSemiBold' };

  // ---------- Medición de texto (canvas, con las mismas fuentes que el PDF) ----------
  const ctx = document.createElement('canvas').getContext('2d');
  function textWidth(text, family, size) {
    ctx.font = `100px "${family}"`;
    return ctx.measureText(text).width * size / 100;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- EAN-13 ----------
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = L.map(c => c.split('').map(b => (b === '1' ? '0' : '1')).reverse().join(''));
  const R = L.map(c => c.split('').map(b => (b === '1' ? '0' : '1')).join(''));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function eanCheckDigit(d12) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1);
    return (10 - (s % 10)) % 10;
  }

  // Devuelve {ok, code, error, expected}
  function validateEAN(raw) {
    const v = String(raw || '').replace(/\s+/g, '');
    if (!/^\d*$/.test(v)) return { ok: false, error: 'Solo puede tener números.' };
    if (v.length === 12) return { ok: true, code: v + eanCheckDigit(v), completed: true };
    if (v.length !== 13) return { ok: false, error: `Tiene que tener 12 o 13 dígitos (tiene ${v.length}).` };
    const exp = eanCheckDigit(v.slice(0, 12));
    if (exp !== +v[12]) return { ok: false, error: `El último dígito debería ser ${exp}.`, expected: v.slice(0, 12) + exp };
    return { ok: true, code: v };
  }

  function eanModules(code) {
    const p = PARITY[+code[0]];
    let m = '101';
    for (let i = 0; i < 6; i++) m += (p[i] === 'L' ? L : G)[+code[i + 1]];
    m += '01010';
    for (let i = 0; i < 6; i++) m += R[+code[i + 7]];
    return m + '101';
  }

  function barcodeSVG(rawCode) {
    const bx = 142.8, by = 183.6, bw = 73.7, bh = 62.3;
    let out = `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#ffffff"/>`;
    const v = validateEAN(rawCode);
    if (!v.ok) {
      const empty = !String(rawCode || '').trim();
      const msg = empty ? 'Sin código' : 'Código inválido';
      const w = textWidth(msg, FONT.regular, 6);
      out += `<text x="${(bx + bw / 2 - w / 2).toFixed(3)}" y="${by + bh / 2 + 2}" font-family="${FONT.regular}" font-size="6" fill="${empty ? '#888888' : '#c0392b'}">${msg}</text>`;
      return out;
    }
    const code = v.code, mods = eanModules(code);
    const x0 = 154.37, mw = 0.588, top = 188.8, bot = 228.9, guardBot = 235.0;
    const isGuard = i => i < 3 || (i >= 45 && i < 50) || i >= 92;
    let i = 0;
    while (i < 95) {
      if (mods[i] === '1') {
        let j = i;
        while (j < 95 && mods[j] === '1' && isGuard(j) === isGuard(i)) j++;
        const h = (isGuard(i) ? guardBot : bot) - top;
        out += `<rect x="${(x0 + i * mw).toFixed(3)}" y="${top}" width="${((j - i) * mw).toFixed(3)}" height="${h.toFixed(3)}" fill="#000000"/>`;
        i = j;
      } else i++;
    }
    // Dígitos chicos dentro del código
    const fs = 5, base = 233.8, pitch = 2.8;
    const digitRow = (str, centerX) => {
      let s = '';
      const start = centerX - (str.length * pitch) / 2;
      for (let k = 0; k < str.length; k++) {
        const cx = start + pitch * (k + 0.5);
        const w = textWidth(str[k], FONT.regular, fs);
        s += `<text x="${(cx - w / 2).toFixed(3)}" y="${base}" font-family="${FONT.regular}" font-size="${fs}" fill="#000000">${str[k]}</text>`;
      }
      return s;
    };
    out += `<text x="149.9" y="${base}" font-family="${FONT.regular}" font-size="${fs}" fill="#000000">${code[0]}</text>`;
    out += digitRow(code.slice(1, 7), x0 + 24 * mw);
    out += digitRow(code.slice(7), x0 + 71 * mw);
    // Número completo debajo
    out += `<text x="149.4" y="241.4" font-family="${FONT.regular}" font-size="7.4" fill="#231f20">${code}</text>`;
    return out;
  }

  // ---------- Texto con salto de línea ----------
  function wrap(text, family, size, maxW) {
    const lines = [];
    String(text || '').split('\n').forEach(par => {
      const words = par.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      let cur = '';
      words.forEach(w => {
        const t = cur ? cur + ' ' + w : w;
        if (cur && textWidth(t, family, size) > maxW) { lines.push(cur); cur = w; } else cur = t;
      });
      if (cur) lines.push(cur);
    });
    return lines;
  }

  // ---------- Etiqueta completa ----------
  // p: {weight, name, color, ingredients, month, year, barcode}
  // s: {phone, instagram}
  function labelSVG(p, s, idSuffix) {
    const A = window.FF_ASSETS;
    const id = idSuffix || Math.random().toString(36).slice(2, 8);
    const clips = A.clips.replace(/ffclipA/g, 'ffA' + id).replace(/ffclipB/g, 'ffB' + id);
    const bg = A.bg.replace(/ffclipA/g, 'ffA' + id).replace(/ffclipB/g, 'ffB' + id);

    let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    o += `<defs>${clips}<clipPath id="page${id}"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`;
    o += `<g clip-path="url(#page${id})">`;
    o += bg + A.logo + A.separator + A.whatsapp + A.instagram + A.dateMarks;

    // Peso (vertical)
    if (p.weight) {
      o += `<text transform="translate(21.1 40.7) rotate(-90)" font-family="${FONT.semibold}" font-size="8" fill="#54bb70">${esc(p.weight)}</text>`;
    }

    // Píldora con el nombre
    let ts = 12;
    const maxPill = W - 20;
    while (ts > 7 && textWidth(p.name, FONT.semibold, ts) + 33 > maxPill) ts -= 0.25;
    const tw = textWidth(p.name, FONT.semibold, ts);
    const pw = Math.max(tw + 33, 60), ph = 19.6, py = 108.9;
    o += `<rect x="${(CX - pw / 2).toFixed(3)}" y="${py}" width="${pw.toFixed(3)}" height="${ph}" rx="${ph / 2}" ry="${ph / 2}" fill="${esc(p.color)}"/>`;
    o += `<text x="${(CX - tw / 2).toFixed(3)}" y="${(122.4 - (12 - ts) * 0.35).toFixed(3)}" font-family="${FONT.semibold}" font-size="${ts}" fill="#ffffff">${esc(p.name)}</text>`;

    // Ingredientes
    let fs = 9, lines = wrap(p.ingredients, FONT.light, fs, 198);
    while (lines.length > 4 && fs > 6.5) { fs -= 0.25; lines = wrap(p.ingredients, FONT.light, fs, 198); }
    const lh = fs * 1.2, mid = 155.7;
    const first = mid - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, k) => {
      const w = textWidth(ln, FONT.light, fs);
      o += `<text x="${(CX - w / 2).toFixed(3)}" y="${(first + k * lh).toFixed(3)}" font-family="${FONT.light}" font-size="${fs}" fill="#ffffff">${esc(ln)}</text>`;
    });

    // Contacto
    o += `<text x="23.7" y="218.4" font-family="${FONT.light}" font-size="8" fill="#ffffff">${esc(s.phone)}</text>`;
    o += `<text x="23.9" y="232.9" font-family="${FONT.light}" font-size="8" fill="#ffffff">${esc(s.instagram)}</text>`;

    // Vencimiento
    o += `<text x="105.2" y="217.8" font-family="${FONT.light}" font-size="8" fill="#ffffff">Venc.:</text>`;
    const dateTxt = (str, left, right) => {
      if (!str) return '';
      const w = textWidth(str, FONT.regular, 9);
      return `<text x="${((left + right) / 2 - w / 2).toFixed(3)}" y="229.93" font-family="${FONT.regular}" font-size="9" fill="#ffffff">${esc(str)}</text>`;
    };
    o += dateTxt(p.month, 106.6, 116.7) + dateTxt(p.year, 122.6, 132.7);

    // Código de barras
    o += barcodeSVG(p.barcode);
    o += `</g></svg>`;
    return o;
  }

  // ---------- Generación de códigos ----------
  // Rangos que no se usan para códigos provisorios:
  // 2x (uso interno / balanzas de supermercado), 779 (empresas argentinas registradas en GS1),
  // 95x-96x (GS1 global), 977-979 (revistas y libros), 98x-99x (cupones y recibos).
  function reservedPrefix(code) {
    const p3 = +code.slice(0, 3);
    return code[0] === '2' || code.startsWith('779') || p3 >= 950;
  }

  function randomProvisional(known) {
    for (let tries = 0; tries < 1000; tries++) {
      let d = '';
      const rnd = new Uint32Array(12);
      crypto.getRandomValues(rnd);
      for (let i = 0; i < 12; i++) d += rnd[i] % 10;
      if (d[0] === '0' || reservedPrefix(d)) continue;
      const code = d + eanCheckDigit(d);
      if (!known.has(code)) return code;
    }
    throw new Error('No se pudo generar un código libre.');
  }

  // prefix: prefijo de empresa GS1 (solo números). Devuelve el siguiente código libre.
  function nextGS1(prefix, known) {
    const refLen = 12 - prefix.length;
    if (refLen < 1) throw new Error('El prefijo es demasiado largo.');
    const max = Math.pow(10, refLen) - 1;
    let last = 0;
    known.forEach(c => {
      if (c && c.length === 13 && c.startsWith(prefix)) last = Math.max(last, +c.slice(prefix.length, 12));
    });
    for (let n = last + 1; n <= max; n++) {
      const d = prefix + String(n).padStart(refLen, '0');
      const code = d + eanCheckDigit(d);
      if (!known.has(code)) return code;
    }
    throw new Error(`Se usaron todos los números de producto de tu prefijo (${max}).`);
  }

  window.FFLabel = { W, H, FONT, labelSVG, validateEAN, eanCheckDigit, randomProvisional, nextGS1 };
})();
