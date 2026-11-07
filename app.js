(function () {
  const { labelSVG, validateEAN, randomProvisional, nextGS1, W, H, FONT } = window.FFLabel;
  const GS1_VERIFY_URL = 'https://www.gs1.org/services/verified-by-gs1';
  const STORE_KEY = 'feelfoods-etiquetas-v1';

  const COLORS = [
    { name: 'Deporte', hex: '#974744' },
    { name: 'Europeo', hex: '#418964' },
    { name: 'Europeo c/maní', hex: '#54BB70' },
    { name: 'Premium', hex: '#7B481A' },
    { name: 'Premium c/maní', hex: '#87581E' },
  ];

  const BASE = [
    { name: 'Mix Deporte', color: '#974744', ingredients: 'Nueces - Almendras - Castañas de Cajú -\nManí Tostado S/Sal - Banana Glaseada.' },
    { name: 'Mix Europeo', color: '#418964', ingredients: 'Nueces - Almendras - Castañas\nde Cajú - Pasas de Uva.' },
    { name: 'Mix Europeo C/ maní', color: '#54BB70', ingredients: 'Nueces - Almendras - Castañas de Cajú\n- Maní Tostado S/Sal - Pasas de Uva.' },
    { name: 'Mix Premium', color: '#7B481A', ingredients: 'Nueces - Avellanas - Almendras -\nCastañas de Cajú.' },
    { name: 'Mix Premium C/maní', color: '#87581E', ingredients: 'Nueces - Avellanas - Almendras -\nCastañas de Cajú - Mani Tostado S/Sal.' },
  ];
  const CODES = ['6400666840516', '2740605758569', '8664399844281', '4251223173316', '4335856335065',
    '1855496367088', '3854727894971', '1348895468420', '7093646116627', '9108892124819'];

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function defaultState() {
    const products = [];
    ['250gr.', '500gr.'].forEach((weight, wi) => {
      BASE.forEach((b, i) => {
        products.push({ id: uid(), weight, name: b.name, color: b.color, ingredients: b.ingredients,
          month: '12', year: '26', barcode: CODES[wi * 5 + i], barcodeKind: 'existente', barcodeLocked: true, selected: true, copies: 1 });
      });
    });
    // En el original, el Mix Deporte 500gr. corta la línea distinto
    products[5].ingredients = 'Nueces - Almendras - Castañas de Cajú\n- Maní Tostado S/Sal - Banana Glaseada.';
    return {
      settings: { phone: '3456 59 20 37', instagram: 'FeelFoodsMarket', a4Marks: true, gs1Prefix: '' },
      products, current: products[0].id,
      issued: CODES.map(code => ({ code, kind: 'existente', label: '', date: '' })),
    };
  }

  // Completa campos que pueden faltar en datos guardados o importados de versiones anteriores
  function normalize(st) {
    st.settings = { ...defaultState().settings, ...(st.settings || {}) };
    if (!Array.isArray(st.issued)) st.issued = [];
    const known = new Set(st.issued.map(i => i.code));
    CODES.forEach(code => { if (!known.has(code)) { st.issued.push({ code, kind: 'existente', label: '', date: '' }); known.add(code); } });
    st.products.forEach(p => {
      p.id = p.id || uid();
      if (p.barcodeKind === undefined) p.barcodeKind = CODES.includes(p.barcode) ? 'existente' : (p.barcode ? 'manual' : '');
      if (p.barcodeLocked === undefined) p.barcodeLocked = CODES.includes(p.barcode);
      const v = validateEAN(p.barcode);
      if (v.ok && !known.has(v.code)) { st.issued.push({ code: v.code, kind: p.barcodeKind || 'manual', label: `${p.name} ${p.weight}`, date: '' }); known.add(v.code); }
    });
    if (!st.products.some(p => p.id === st.current)) st.current = st.products[0].id;
    return st;
  }

  let state;
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { state = null; }
  if (!state || !Array.isArray(state.products) || !state.products.length) state = defaultState();
  state = normalize(state);

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }

  const $ = s => document.querySelector(s);
  const cur = () => state.products.find(p => p.id === state.current) || state.products[0];

  // ---------- Códigos de barras ----------
  function normCode(raw) { const v = validateEAN(raw); return v.ok ? v.code : null; }

  // Todos los códigos que ya se usaron alguna vez (no se vuelven a generar)
  function knownCodes() {
    const s = new Set(state.issued.map(i => i.code));
    state.products.forEach(p => { const c = normCode(p.barcode); if (c) s.add(c); });
    return s;
  }

  function duplicatesOf(p) {
    const c = normCode(p.barcode);
    if (!c) return [];
    return state.products.filter(q => q !== p && normCode(q.barcode) === c);
  }

  function gs1Prefix() { return String(state.settings.gs1Prefix || '').replace(/\D/g, ''); }

  function prefixStatus() {
    const pr = gs1Prefix();
    if (!pr) return { ok: false, empty: true };
    if (pr.length < 6 || pr.length > 11) return { ok: false, error: 'El prefijo GS1 suele tener entre 7 y 10 dígitos.' };
    const cap = Math.pow(10, 12 - pr.length) - 1;
    const used = [...knownCodes()].filter(c => c.startsWith(pr)).length;
    return { ok: true, cap, used, warn: pr.startsWith('779') ? '' : 'Los prefijos de GS1 Argentina empiezan con 779. Revisá que esté bien copiado.' };
  }

  function generateCode() {
    const p = cur();
    if (p.barcodeLocked) return;
    const ps = prefixStatus();
    if (!ps.empty && !ps.ok) return flash(ps.error);
    if (p.barcode && !confirm(`Este producto ya tiene el código ${p.barcode}. ¿Reemplazarlo por uno nuevo?`)) return;
    try {
      const kind = ps.ok ? 'gs1' : 'provisorio';
      const code = ps.ok ? nextGS1(gs1Prefix(), knownCodes()) : randomProvisional(knownCodes());
      p.barcode = code; p.barcodeKind = kind;
      state.issued.push({ code, kind, label: `${p.name} ${p.weight}`, date: new Date().toISOString().slice(0, 10) });
      save(); renderAll();
      flash(kind === 'gs1' ? `Código GS1 generado: ${code}` : `Código provisorio generado: ${code}. Revisalo en GS1 antes de imprimir.`);
    } catch (e) { flash(e.message); }
  }

  function verifyInGS1() {
    const c = normCode(cur().barcode);
    if (!c) return flash('Primero tiene que haber un código válido.');
    const done = () => { window.open(GS1_VERIFY_URL, '_blank', 'noopener'); };
    if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => { flash(`Código ${c} copiado. Pegalo en el buscador de GS1.`); done(); }, done);
    else done();
  }

  // ---------- Fuentes ----------
  function b64ToBuf(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  async function loadFonts() {
    const map = { FFLight: 'Light', FFRegular: 'Regular', FFSemiBold: 'SemiBold' };
    await Promise.all(Object.entries(map).map(async ([fam, w]) => {
      const f = new FontFace(fam, b64ToBuf(window.FF_FONTS[w]));
      await f.load();
      document.fonts.add(f);
    }));
  }

  // ---------- Render ----------
  function renderList() {
    const list = $('#list');
    list.innerHTML = '';
    state.products.forEach(p => {
      const li = document.createElement('li');
      li.className = 'item' + (p.id === state.current ? ' active' : '');
      const problem = !validateEAN(p.barcode).ok ? (p.barcode ? 'Código inválido' : 'Sin código') : (duplicatesOf(p).length ? 'Código repetido' : '');
      li.innerHTML = `
        <input type="checkbox" class="sel" title="Incluir en la descarga" ${p.selected ? 'checked' : ''}>
        <span class="dot" style="background:${p.color}"></span>
        <button class="pick"><span class="nm"></span><span class="wt"></span>${problem ? `<span class="warn" title="${problem}">!</span>` : ''}</button>
        <label class="copies" title="Copias en la hoja A4">×<input type="number" min="0" max="99" value="${p.copies ?? 1}"></label>`;
      li.querySelector('.nm').textContent = p.name || '(sin nombre)';
      li.querySelector('.wt').textContent = p.weight;
      li.querySelector('.pick').onclick = () => { state.current = p.id; save(); renderAll(); };
      li.querySelector('.sel').onchange = e => { p.selected = e.target.checked; save(); updateCount(); };
      li.querySelector('.copies input').onchange = e => { p.copies = Math.max(0, Math.min(99, parseInt(e.target.value) || 0)); e.target.value = p.copies; save(); updateCount(); };
      list.appendChild(li);
    });
    updateCount();
  }

  function updateCount() {
    const sel = state.products.filter(p => p.selected);
    const copies = sel.reduce((a, p) => a + (p.copies ?? 1), 0);
    $('#selCount').textContent = `${sel.length} seleccionada${sel.length === 1 ? '' : 's'}`;
    $('#a4Info').textContent = `${copies} etiqueta${copies === 1 ? '' : 's'} · ${Math.ceil(copies / 6) || 0} hoja${Math.ceil(copies / 6) === 1 ? '' : 's'}`;
    $('#allSel').checked = sel.length === state.products.length;
    $('#allSel').indeterminate = sel.length > 0 && sel.length < state.products.length;
  }

  function renderPreview() {
    $('#preview').innerHTML = labelSVG(cur(), state.settings, 'prev');
  }

  function renderForm() {
    const p = cur();
    $('#f-name').value = p.name;
    $('#f-weight').value = p.weight;
    $('#f-color').value = p.color;
    $('#f-colorhex').value = p.color.toUpperCase();
    $('#f-ingredients').value = p.ingredients;
    $('#f-month').value = p.month;
    $('#f-year').value = p.year;
    $('#f-barcode').value = p.barcode;
    $('#s-phone').value = state.settings.phone;
    $('#s-instagram').value = state.settings.instagram;
    $('#s-marks').checked = state.settings.a4Marks !== false;
    if (document.activeElement !== $('#s-gs1')) $('#s-gs1').value = state.settings.gs1Prefix || '';
    document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.hex.toLowerCase() === p.color.toLowerCase()));
    renderBarcodeMsg();
  }

  const KIND_LABEL = {
    existente: ['En uso en supermercados', 'kind-ok'],
    gs1: ['GS1 oficial', 'kind-ok'],
    provisorio: ['Provisorio (no registrado)', 'kind-warn'],
    manual: ['Cargado a mano', 'kind-muted'],
  };

  function renderBarcodeMsg() {
    const p = cur(), v = validateEAN(p.barcode), el = $('#bc-msg');
    const input = $('#f-barcode');
    input.readOnly = !!p.barcodeLocked;

    // Etiqueta del tipo de código
    const kind = KIND_LABEL[p.barcodeKind];
    $('#bc-kind').innerHTML = kind && p.barcode ? `<span class="kind ${kind[1]}">${kind[0]}</span>` : '';

    // Botones
    const ps = prefixStatus();
    $('#bc-gen').hidden = !!p.barcodeLocked;
    $('#bc-gen').textContent = ps.ok ? 'Generar código GS1' : 'Generar código provisorio';
    $('#bc-unlock').hidden = !p.barcodeLocked;
    $('#bc-verify').hidden = !(v.ok && p.barcodeKind !== 'gs1' && p.barcodeKind !== 'existente');

    // Mensaje
    el.innerHTML = '';
    const dups = duplicatesOf(p);
    if (p.barcodeLocked) {
      el.className = 'hint';
      el.textContent = 'Este código ya está cargado en los supermercados. Está bloqueado para que no se cambie por error.';
    } else if (!p.barcode) {
      el.className = 'hint bad';
      el.textContent = 'Este producto no tiene código. Generá uno nuevo o cargalo a mano.';
    } else if (!v.ok) {
      el.className = 'hint bad';
      el.textContent = v.error + ' ';
      if (v.expected) {
        const b = document.createElement('button');
        b.className = 'link'; b.type = 'button'; b.textContent = 'Corregir';
        b.onclick = () => { cur().barcode = v.expected; save(); renderAll(); };
        el.appendChild(b);
      }
    } else if (dups.length) {
      el.className = 'hint bad';
      el.textContent = `Cada producto tiene que tener un código distinto, y este ya lo usa: ${dups.map(q => q.name + ' ' + q.weight).join(', ')}`;
    } else if (p.barcodeKind === 'provisorio') {
      el.className = 'hint warn';
      el.textContent = 'Código provisorio: no está registrado a tu nombre y podría coincidir con el de otra marca. Antes de imprimir, revisá en GS1 que no aparezca registrado por nadie.';
    } else if (v.completed) {
      el.className = 'hint ok';
      el.textContent = `Se agrega el dígito verificador: ${v.code}`;
    } else {
      el.className = 'hint ok';
      el.textContent = 'Código EAN-13 válido.';
    }

    // Estado del prefijo GS1
    const pm = $('#gs1-msg');
    if (ps.empty) { pm.className = 'hint'; pm.textContent = 'Sin prefijo: los códigos nuevos se generan en modo provisorio.'; }
    else if (!ps.ok) { pm.className = 'hint bad'; pm.textContent = ps.error; }
    else {
      pm.className = 'hint ' + (ps.warn ? 'warn' : 'ok');
      pm.textContent = `Modo GS1 activo. Usados ${ps.used} de ${ps.cap.toLocaleString('es-AR')} códigos posibles.` + (ps.warn ? ' ' + ps.warn : '');
    }
  }

  function renderAll() { renderList(); renderForm(); renderPreview(); }

  // ---------- Formulario ----------
  function bind(sel, fn) {
    $(sel).addEventListener('input', e => { fn(e.target.value); save(); renderPreview(); renderList(); });
  }
  function setupForm() {
    bind('#f-name', v => cur().name = v);
    bind('#f-weight', v => cur().weight = v);
    bind('#f-ingredients', v => cur().ingredients = v);
    bind('#f-month', v => cur().month = v);
    bind('#f-year', v => cur().year = v);
    bind('#f-barcode', v => {
      const p = cur(); if (p.barcodeLocked) return;
      const d = v.replace(/\D/g, '');
      if (d !== p.barcode) { p.barcode = d; p.barcodeKind = d ? 'manual' : ''; }
      renderBarcodeMsg();
    });
    bind('#s-gs1', v => { state.settings.gs1Prefix = v.replace(/\D/g, ''); renderBarcodeMsg(); });
    $('#bc-gen').onclick = generateCode;
    $('#bc-verify').onclick = verifyInGS1;
    $('#bc-unlock').onclick = () => {
      if (!confirm('Este código ya está cargado en los supermercados. Si lo cambiás, el súper no va a reconocer el producto hasta que actualice el alta.\n\n¿Desbloquear igual?')) return;
      cur().barcodeLocked = false; save(); renderBarcodeMsg();
    };
    bind('#s-phone', v => state.settings.phone = v);
    bind('#s-instagram', v => state.settings.instagram = v);
    $('#s-marks').onchange = e => { state.settings.a4Marks = e.target.checked; save(); };
    const setColor = hex => { cur().color = hex; save(); renderForm(); renderPreview(); renderList(); };
    $('#f-color').addEventListener('input', e => setColor(e.target.value));
    $('#f-colorhex').addEventListener('change', e => {
      let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) setColor(v); else e.target.value = cur().color.toUpperCase();
    });
    const sw = $('#swatches');
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'swatch'; b.dataset.hex = c.hex; b.title = c.name; b.style.background = c.hex;
      b.onclick = () => setColor(c.hex);
      sw.appendChild(b);
    });
    $('#applyDate').onclick = () => {
      const p = cur();
      state.products.forEach(q => { q.month = p.month; q.year = p.year; });
      save(); flash(`Vencimiento ${p.month || '__'}/${p.year || '__'} aplicado a todas`);
    };
    $('#allSel').onchange = e => { state.products.forEach(p => p.selected = e.target.checked); save(); renderList(); };

    $('#btnAdd').onclick = () => {
      const p = { id: uid(), weight: '250gr.', name: 'Mix Nuevo', color: '#418964', ingredients: 'Ingrediente - Ingrediente.', month: cur().month, year: cur().year, barcode: '', barcodeKind: '', barcodeLocked: false, selected: true, copies: 1 };
      state.products.push(p); state.current = p.id; save(); renderAll(); $('#f-name').select();
    };
    $('#btnDup').onclick = () => {
      const src = cur(), p = { ...src, id: uid(), barcode: '', barcodeKind: '', barcodeLocked: false };
      state.products.splice(state.products.indexOf(src) + 1, 0, p); state.current = p.id; save(); renderAll();
      flash('Duplicada sin código de barras. Generale uno nuevo.');
    };
    $('#btnDel').onclick = () => {
      if (state.products.length <= 1) return flash('Tiene que quedar al menos una etiqueta.');
      const p = cur(), code = normCode(p.barcode);
      if (!confirm(`¿Borrar "${p.name} ${p.weight}"?` + (code ? `\n\nEl código ${code} queda registrado como usado y no se va a volver a generar para otro producto.` : ''))) return;
      if (code && !state.issued.some(i => i.code === code)) state.issued.push({ code, kind: p.barcodeKind || 'manual', label: `${p.name} ${p.weight}`, date: new Date().toISOString().slice(0, 10) });
      const i = state.products.indexOf(p);
      state.products.splice(i, 1);
      state.current = state.products[Math.min(i, state.products.length - 1)].id;
      save(); renderAll();
    };
    $('#btnUp').onclick = () => move(-1);
    $('#btnDown').onclick = () => move(1);

    $('#dlOne').onclick = () => downloadLabels([cur()], fileName(cur()));
    $('#dlSel').onclick = () => {
      const sel = state.products.filter(p => p.selected);
      if (!sel.length) return flash('No hay etiquetas seleccionadas.');
      downloadLabels(sel, 'FeelFoods etiquetas 80x90mm.pdf');
    };
    $('#dlA4').onclick = () => downloadA4();

    $('#btnExport').onclick = () => {
      const blob = new Blob([JSON.stringify({ version: 2, settings: state.settings, products: state.products, issued: state.issued }, null, 2)], { type: 'application/json' });
      saveBlob(blob, 'feelfoods-etiquetas.json');
    };
    $('#btnImport').onclick = () => $('#importFile').click();
    $('#importFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.products) || !data.products.length) throw new Error();
        // Se conservan los códigos usados de antes y se suman los del respaldo
        const issued = [...state.issued];
        (data.issued || []).forEach(i => { if (i && i.code && !issued.some(x => x.code === i.code)) issued.push(i); });
        state = normalize({ settings: data.settings, products: data.products.map(p => ({ ...p })), issued, current: null });
        save(); renderAll(); flash('Etiquetas importadas.');
      } catch (err) { flash('Ese archivo no es un respaldo válido.'); }
      e.target.value = '';
    };
    $('#btnReset').onclick = () => {
      if (!confirm('¿Volver a las 10 etiquetas originales? Se pierden los cambios que no hayas exportado.')) return;
      const issued = state.issued, prefix = state.settings.gs1Prefix;
      state = defaultState(); state.issued = issued; state.settings.gs1Prefix = prefix;
      state = normalize(state); save(); renderAll();
    };
  }

  function move(d) {
    const i = state.products.indexOf(cur()), j = i + d;
    if (j < 0 || j >= state.products.length) return;
    [state.products[i], state.products[j]] = [state.products[j], state.products[i]];
    save(); renderList();
  }

  let flashT;
  function flash(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ---------- PDF ----------
  function fileName(p) { return `${p.name} ${p.weight}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\.$/, '').trim() + '.pdf'; }

  function invalid(list) {
    const bad = list.filter(p => !validateEAN(p.barcode).ok);
    if (bad.length) {
      flash(`Falta el código de barras o es inválido en: ${bad.map(p => p.name + ' ' + p.weight).join(', ')}`);
      return true;
    }
    const dup = list.filter(p => duplicatesOf(p).length);
    if (dup.length) {
      flash(`Código de barras repetido en: ${dup.map(p => p.name + ' ' + p.weight).join(', ')}`);
      return true;
    }
    return false;
  }

  function newDoc(format) {
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format, orientation: format[0] > format[1] ? 'l' : 'p', compress: true });
    const map = { FFLight: 'Light', FFRegular: 'Regular', FFSemiBold: 'SemiBold' };
    Object.entries(map).forEach(([fam, w]) => {
      doc.addFileToVFS(fam + '.ttf', window.FF_FONTS[w]);
      doc.addFont(fam + '.ttf', fam, 'normal');
    });
    return doc;
  }

  function svgEl(p, k) {
    const holder = $('#render');
    holder.innerHTML = labelSVG(p, state.settings, 'r' + k);
    return holder.firstElementChild;
  }

  async function busy(fn) {
    document.body.classList.add('busy');
    try { await fn(); } catch (e) { console.error(e); flash('No se pudo generar el PDF: ' + e.message); }
    finally { document.body.classList.remove('busy'); $('#render').innerHTML = ''; }
  }

  function downloadLabels(list, name) {
    if (invalid(list)) return;
    busy(async () => {
      const doc = newDoc([W, H]);
      for (let k = 0; k < list.length; k++) {
        if (k) doc.addPage([W, H], 'p');
        await doc.svg(svgEl(list[k], k), { x: 0, y: 0, width: W, height: H });
      }
      doc.setProperties({ title: name.replace(/\.pdf$/, ''), creator: 'Feel Foods - Editor de etiquetas' });
      doc.save(name);
    });
  }

  function downloadA4() {
    const items = [];
    state.products.filter(p => p.selected).forEach(p => { for (let c = 0; c < (p.copies ?? 1); c++) items.push(p); });
    if (!items.length) return flash('No hay etiquetas para la hoja (revisá selección y copias).');
    if (invalid([...new Set(items)])) return;
    busy(async () => {
      const A4 = [595.276, 841.89];
      const doc = newDoc(A4);
      const cols = 2, rows = 3, gw = cols * W, gh = rows * H;
      const ox = (A4[0] - gw) / 2, oy = (A4[1] - gh) / 2;
      for (let k = 0; k < items.length; k++) {
        const slot = k % 6;
        if (k && slot === 0) doc.addPage(A4, 'p');
        const x = ox + (slot % cols) * W, y = oy + Math.floor(slot / cols) * H;
        await doc.svg(svgEl(items[k], k), { x, y, width: W, height: H });
        if (slot === 5 || k === items.length - 1) { if (state.settings.a4Marks !== false) cropMarks(doc, ox, oy); }
      }
      doc.setProperties({ title: 'Feel Foods etiquetas A4', creator: 'Feel Foods - Editor de etiquetas' });
      doc.save('FeelFoods etiquetas A4.pdf');
    });
  }

  function cropMarks(doc, ox, oy) {
    doc.setDrawColor(120); doc.setLineWidth(0.4);
    const xs = [ox, ox + W, ox + 2 * W], ys = [oy, oy + H, oy + 2 * H, oy + 3 * H];
    const len = 9, gap = 3;
    xs.forEach(x => { doc.line(x, oy - gap - len, x, oy - gap); doc.line(x, oy + 3 * H + gap, x, oy + 3 * H + gap + len); });
    ys.forEach(y => { doc.line(ox - gap - len, y, ox - gap, y); doc.line(ox + 2 * W + gap, y, ox + 2 * W + gap + len, y); });
  }

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Inicio ----------
  loadFonts().then(() => { setupForm(); renderAll(); document.body.classList.remove('loading'); })
    .catch(e => { console.error(e); setupForm(); renderAll(); document.body.classList.remove('loading'); });
})();
