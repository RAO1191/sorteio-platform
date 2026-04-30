// ── Singletons ────────────────────────────────────────────────────────────────
const store  = new DataStore();
const raffle = new GeneralRaffle();
const grp    = new GroupRaffle();

let numGroups    = 4;
let currentGrpResult = null;
let tableFilter  = '';

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.goto));
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${name}`));
  if (name === 'raffle') refreshRaffleView();
  if (name === 'groups') refreshGroupsView();
}

// ── DATA TAB ──────────────────────────────────────────────────────────────────

document.getElementById('import-btn').addEventListener('click',   () => document.getElementById('file-input').click());
document.getElementById('reimport-btn').addEventListener('click', () => document.getElementById('file-input').click());

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      // SheetJS handles .xlsx, .xls and .csv transparently
      const workbook = XLSX.read(ev.target.result, {
        type:      'binary',
        cellDates: true,   // date cells → JS Date objects
        cellNF:    false,
        cellText:  false
      });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(sheet, {
        header: 1,         // return array-of-arrays
        raw:    true,      // keep native types: Date, number, string
        defval: ''         // empty cells = empty string
      });

      store.loadRows(rows);
      raffle.reset();
      currentGrpResult = null;
      renderDataTab();
      refreshRaffleView();
      refreshGroupsView();
      updateHeaderInfo();
    } catch (err) {
      alert('Erro ao importar: ' + err.message);
    }
    e.target.value = '';
  };
  reader.readAsBinaryString(file);
});

document.getElementById('clear-data-btn').addEventListener('click', () => {
  if (!confirm('Remover todos os dados importados?')) return;
  store.clear();
  raffle.reset();
  currentGrpResult = null;
  renderDataTab();
  refreshRaffleView();
  refreshGroupsView();
  updateHeaderInfo();
});

document.getElementById('table-search').addEventListener('input', e => {
  tableFilter = e.target.value.toLowerCase();
  renderTable();
});

function renderDataTab() {
  const hasData = store.participants.length > 0;
  document.getElementById('import-hero').classList.toggle('hidden', hasData);
  document.getElementById('data-loaded').classList.toggle('hidden', !hasData);
  if (!hasData) return;

  // Stats
  const s = store.stats;
  document.getElementById('stat-total').textContent    = s.total;
  document.getElementById('stat-male').textContent     = s.male;
  document.getElementById('stat-female').textContent   = s.female;
  document.getElementById('stat-families').textContent = s.vouchers;
  document.getElementById('stat-age-range').textContent =
    (s.minAge !== null) ? `${s.minAge}–${s.maxAge}` : '—';

  document.getElementById('tab-data-badge').textContent = s.total;
  document.getElementById('tab-data-badge').classList.remove('hidden');

  // Warn if dates couldn't be parsed
  const semData = store.participants.filter(p => p.age === null).length;
  let warningEl = document.getElementById('date-parse-warning');
  if (!warningEl) {
    warningEl = document.createElement('div');
    warningEl.id = 'date-parse-warning';
    warningEl.style.cssText = 'background:#fff3cd;border:1px solid #f0c674;border-radius:8px;padding:10px 14px;font-size:13px;color:#856404;margin-bottom:12px;';
    document.getElementById('data-loaded').prepend(warningEl);
  }
  if (semData > 0) {
    warningEl.style.display = 'block';
    warningEl.innerHTML = `⚠ <strong>${semData} participante(s)</strong> sem data de nascimento válida — a coluna <code>data_nascimento</code> não foi reconhecida ou está vazia. Esses participantes não aparecerão em filtros por idade.`;
  } else {
    warningEl.style.display = 'none';
  }

  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  const showing = document.getElementById('table-showing');
  const filtered = tableFilter
    ? store.participants.filter(p =>
        p.name.toLowerCase().includes(tableFilter) ||
        p.voucher.toLowerCase().includes(tableFilter) ||
        (p.email || '').toLowerCase().includes(tableFilter))
    : store.participants;

  showing.textContent = `Exibindo ${filtered.length} de ${store.participants.length}`;

  tbody.innerHTML = filtered.map((p, i) =>
    `<tr>
      <td class="idx">${i + 1}</td>
      <td class="voucher-cell">${esc(p.voucher)}</td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${p.gender ? `<span class="gender-badge gender-${p.gender}">${p.gender === 'M' ? 'M' : 'F'}</span>` : '—'}</td>
      <td>${p.tipo2 ? `<span class="tipo2-badge">${esc(p.tipo2)}</span>` : '—'}</td>
      <td>${p.age !== null ? p.age : '—'}</td>
      <td>${esc(p.nascimento || '—')}</td>
      <td>${esc(p.email || '—')}</td>
      <td>${esc(p.telefone || '—')}</td>
    </tr>`
  ).join('');
}

function updateHeaderInfo() {
  const hasData = store.participants.length > 0;
  document.getElementById('header-data-info').classList.toggle('hidden', !hasData);
  document.getElementById('header-total').textContent = `${store.participants.length} participantes`;
}

// ── RAFFLE TAB ────────────────────────────────────────────────────────────────

const raffleAgeFilter = document.getElementById('raffle-age-filter');
const pSearch         = document.getElementById('p-search');
let raffleSearchTerm  = '';

raffleAgeFilter.addEventListener('change', () => { refreshRaffleView(); });
pSearch.addEventListener('input', e => { raffleSearchTerm = e.target.value.toLowerCase(); renderParticipantList(); });

document.getElementById('reset-raffle-btn').addEventListener('click', () => {
  if (!confirm('Reiniciar o sorteio? Todos os nomes sorteados serão removidos da lista de sorteados.')) return;
  raffle.reset();
  resetDrawDisplay();
  refreshRaffleView();
});

document.getElementById('draw-btn').addEventListener('click', startDraw);

function refreshRaffleView() {
  const hasData = store.participants.length > 0;
  document.getElementById('raffle-no-data').classList.toggle('hidden', hasData);
  document.getElementById('raffle-wrap').classList.toggle('hidden', !hasData);
  if (!hasData) return;

  renderParticipantList();
  renderDrawnList();
  updateRaffleInfo();
  updateDrawBtn();
}

function getRafflePool() {
  const minAge = raffleAgeFilter.value ? Number(raffleAgeFilter.value) : null;
  return minAge ? store.filterByAge(minAge) : [...store.participants];
}

function renderParticipantList() {
  const list = document.getElementById('p-list');
  const all  = getRafflePool();
  const term = raffleSearchTerm;

  const visible = term
    ? all.filter(p => p.name.toLowerCase().includes(term))
    : all;

  document.getElementById('p-list-count').textContent = visible.length;

  if (visible.length === 0) {
    list.innerHTML = '<li class="empty-state">Nenhum participante encontrado</li>';
    return;
  }

  // Sort: available first, then drawn
  const sorted = [...visible].sort((a, b) => {
    const ad = raffle.drawnIds.has(a.id) ? 1 : 0;
    const bd = raffle.drawnIds.has(b.id) ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  list.innerHTML = sorted.map((p, i) => {
    const drawn = raffle.drawnIds.has(p.id);
    return `<li class="${drawn ? 'drawn' : 'available'}">
      <span class="p-num">${i + 1}</span>
      ${p.gender ? `<span class="gender-badge gender-${p.gender}">${p.gender}</span>` : ''}
      <span class="p-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="p-age">${p.age !== null ? p.age + 'a' : ''}</span>
      ${drawn ? '<span class="p-drawn-mark">✓</span>' : ''}
    </li>`;
  }).join('');
}

function renderDrawnList() {
  const list = document.getElementById('drawn-list');
  const count = document.getElementById('drawn-count');
  count.textContent = raffle.history.length;

  if (raffle.history.length === 0) {
    list.innerHTML = '<li class="empty-state">Nenhum sorteado ainda</li>';
    return;
  }

  list.innerHTML = [...raffle.history].reverse().map(h =>
    `<li class="drawn-item">
      <div class="drawn-num">${h.num}</div>
      <div class="drawn-info">
        <div class="drawn-name">${esc(h.name)}</div>
        <div class="drawn-details">
          ${h.gender ? `<span class="gender-badge gender-${h.gender}">${h.gender}</span> ` : ''}
          ${h.age ? h.age : ''}
          ${h.tipo2 ? ` · ${esc(h.tipo2)}` : ''}
          ${h.voucher ? ` · ${esc(h.voucher)}` : ''}
          · ${h.time}
        </div>
        ${h.prize ? `<div class="drawn-prize">🎁 ${esc(h.prize)}</div>` : ''}
      </div>
    </li>`
  ).join('');
}

function updateRaffleInfo() {
  const pool = getRafflePool();
  const available = pool.filter(p => !raffle.drawnIds.has(p.id)).length;
  const drawn = raffle.history.length;
  document.getElementById('raffle-avail-pill').textContent = `${available} disponíveis`;
  document.getElementById('raffle-drawn-pill').textContent = `${drawn} sorteados`;
}

function updateDrawBtn() {
  const pool = getRafflePool();
  const available = pool.filter(p => !raffle.drawnIds.has(p.id)).length;
  document.getElementById('draw-btn').disabled = available === 0 || raffle.isAnimating;
}

function resetDrawDisplay() {
  document.getElementById('draw-placeholder').classList.remove('hidden');
  document.getElementById('draw-spinning').classList.add('hidden');
  document.getElementById('draw-winner').classList.add('hidden');
}

function startDraw() {
  if (raffle.isAnimating) return;
  const pool = getRafflePool().filter(p => !raffle.drawnIds.has(p.id));
  if (pool.length === 0) return;

  raffle.isAnimating = true;
  updateDrawBtn();

  // Show spinner
  document.getElementById('draw-placeholder').classList.add('hidden');
  document.getElementById('draw-winner').classList.add('hidden');
  const spinEl    = document.getElementById('draw-spinning');
  const spinName  = document.getElementById('spinning-name');
  const spinSub   = document.getElementById('spinning-sub');
  spinEl.classList.remove('hidden');

  const totalMs = 3000;
  const start   = Date.now();
  let handle;

  const tick = () => {
    const elapsed  = Date.now() - start;
    const progress = Math.min(elapsed / totalMs, 1);
    const interval = 55 + progress * progress * 280; // ease out

    const rnd = pool[Math.floor(Math.random() * pool.length)];
    spinName.textContent = rnd.name;
    spinSub.textContent  = rnd.age !== null ? `${rnd.ageLabel}` : '';

    if (elapsed >= totalMs) {
      clearTimeout(handle);
      finishDraw(pool);
      return;
    }
    handle = setTimeout(tick, interval);
  };

  handle = setTimeout(tick, 55);
}

function finishDraw(pool) {
  const removeWinner = document.getElementById('remove-winner').checked;
  const prize = document.getElementById('prize-input').value.trim();

  // If not removing, we still need to draw — temporarily allow re-draw
  const result = raffle.draw(pool, prize);
  raffle.isAnimating = false;

  if (!result) { resetDrawDisplay(); updateDrawBtn(); return; }

  // If user doesn't want to remove winner, undo the marking
  if (!removeWinner) {
    raffle.drawnIds.delete(result.winner.id);
    // Keep in history anyway so the drawn column records it
  }

  // Show winner
  document.getElementById('draw-spinning').classList.add('hidden');
  const winnerEl = document.getElementById('draw-winner');
  winnerEl.classList.remove('hidden');
  document.getElementById('winner-name').textContent = result.winner.name;

  const meta = [];
  if (result.winner.gender) meta.push(result.winner.gender === 'M' ? 'Masculino' : 'Feminino');
  if (result.winner.ageLabel && result.winner.age !== null) meta.push(result.winner.ageLabel);
  if (result.winner.tipo2) meta.push(result.winner.tipo2);
  document.getElementById('winner-meta').textContent = meta.join(' · ');

  const prizeEl = document.getElementById('winner-prize');
  if (prize) { prizeEl.textContent = '🎁 ' + prize; prizeEl.classList.remove('hidden'); }
  else { prizeEl.classList.add('hidden'); }

  renderParticipantList();
  renderDrawnList();
  updateRaffleInfo();
  updateDrawBtn();
}

// ── GROUPS TAB ────────────────────────────────────────────────────────────────

const groupsAgeFilter = document.getElementById('groups-age-filter');

groupsAgeFilter.addEventListener('change', updateGroupsPreview);
document.getElementById('g-minus').addEventListener('click', () => { if (numGroups > 2) { numGroups--; updateGroupsUI(); } });
document.getElementById('g-plus').addEventListener('click',  () => { if (numGroups < 20) { numGroups++; updateGroupsUI(); } });

document.getElementById('distribute-btn').addEventListener('click', runDistribution);
document.getElementById('g-redo-btn').addEventListener('click', runDistribution);
document.getElementById('g-export-btn').addEventListener('click', exportGroupsCSV);
document.getElementById('g-print-btn').addEventListener('click', () => window.print());

function refreshGroupsView() {
  const hasData = store.participants.length > 0;
  document.getElementById('groups-no-data').classList.toggle('hidden', hasData);
  document.getElementById('groups-wrap').classList.toggle('hidden', !hasData);
  if (hasData) updateGroupsPreview();
}

function updateGroupsUI() {
  document.getElementById('g-count').textContent = numGroups;
  renderGroupNameInputs();
  updateGroupsPreview();
}

function renderGroupNameInputs() {
  const container = document.getElementById('g-names-container');
  const existing  = Array.from(container.querySelectorAll('.input')).map(i => i.value);
  container.innerHTML = '';
  for (let i = 0; i < numGroups; i++) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'input';
    inp.placeholder = `Grupo ${i + 1}`;
    inp.value = existing[i] || '';
    container.appendChild(inp);
  }
}

function getGroupNames() {
  return Array.from(document.querySelectorAll('#g-names-container .input')).map(i => i.value);
}

function updateGroupsPreview() {
  const minAge   = groupsAgeFilter.value ? Number(groupsAgeFilter.value) : null;
  const filtered = minAge ? store.filterByAge(minAge) : [...store.participants];
  const m = filtered.filter(p => p.gender === 'M').length;
  const f = filtered.filter(p => p.gender === 'F').length;

  document.getElementById('groups-preview-count').textContent = filtered.length;
  if (m + f > 0) {
    document.getElementById('groups-gender-preview').textContent = ` (${m} homens, ${f} mulheres)`;
  } else {
    document.getElementById('groups-gender-preview').textContent = '';
  }
}

function runDistribution() {
  if (store.participants.length === 0) return;
  try {
    const minAge   = groupsAgeFilter.value ? Number(groupsAgeFilter.value) : null;
    const filtered = minAge ? store.filterByAge(minAge) : [...store.participants];

    if (filtered.length === 0) {
      const semIdade = store.participants.filter(p => p.age === null).length;
      let msg = `Nenhum participante com ${minAge} anos ou mais encontrado.`;
      if (semIdade > 0) msg += `\n\n${semIdade} participante(s) estão sem data de nascimento válida e não entram no filtro.`;
      msg += '\n\nDica: selecione "Todas as idades" para incluir todos.';
      alert(msg);
      return;
    }

    const names  = getGroupNames();
    const result = grp.distribute(filtered, numGroups, names);
    currentGrpResult = result;
    renderGroupsResult(result);
  } catch (err) {
    alert(err.message);
  }
}

function renderGroupsResult(result) {
  document.getElementById('g-result-placeholder').classList.add('hidden');
  const content = document.getElementById('g-result-content');
  content.classList.remove('hidden');

  const genderInfo = result.hasGender
    ? ` · ${result.totalM} homens, ${result.totalF} mulheres`
    : '';
  document.getElementById('g-result-meta').textContent =
    `${result.numPeople} participantes distribuídos em ${result.groups.length} grupos${genderInfo}`;

  const warnBox = document.getElementById('g-warnings-box');
  if (result.warnings.length > 0) {
    warnBox.classList.remove('hidden');
    document.getElementById('g-warnings-list').innerHTML =
      result.warnings.map(w => `<li>${esc(w)}</li>`).join('');
  } else {
    warnBox.classList.add('hidden');
  }

  const grid = document.getElementById('groups-grid');
  grid.innerHTML = result.groups.map((g, i) => {
    const statsHtml = result.hasGender
      ? `<span class="group-card-stats">${g.maleCount}H ${g.femaleCount}M</span>`
      : `<span class="group-card-stats">${g.members.length} pessoas</span>`;

    const membersHtml = g.members.map(m =>
      `<div class="group-member">
        ${m.gender ? `<span class="gender-badge gender-${m.gender}">${m.gender}</span>` : ''}
        <span class="gm-name" title="${esc(m.name)}">${esc(m.name)}</span>
        ${m.age !== null ? `<span class="p-age">${m.age}a</span>` : ''}
        ${m.voucher ? `<span class="gm-voucher">${esc(m.voucher)}</span>` : ''}
      </div>`
    ).join('');

    return `<div class="group-card">
      <div class="group-card-header gc-${i % 8}">
        <span>${esc(g.name)}</span>
        ${statsHtml}
      </div>
      <div class="group-card-body">${membersHtml}</div>
    </div>`;
  }).join('');
}

function exportGroupsCSV() {
  if (!currentGrpResult) return;
  const csv  = grp.exportCSV(currentGrpResult);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'grupos_sorteio.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
renderDataTab();
renderGroupNameInputs();
