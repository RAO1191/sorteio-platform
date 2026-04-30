class DataStore {
  constructor() {
    this.participants = [];
    this._nextId = 1;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  // rows: array-of-arrays from SheetJS sheet_to_json({ header: 1 })
  // rows[0] = header row, rows[1..] = data rows
  loadRows(rows) {
    this.participants = [];
    this._nextId = 1;

    if (!rows || rows.length < 2) throw new Error('Planilha vazia ou sem dados.');

    const header = rows[0].map(h => String(h ?? '').toLowerCase().trim());

    const col = {
      voucher:    this._colIdx(header, ['voucher_codigo', 'voucher', 'codigo']),
      nome:       this._colIdx(header, ['nome', 'name', 'participante']),
      tipo:       this._colIdx(header, ['tipo']),           // gender: MASCULINO / FEMININO
      tipo2:      this._colIdx(header, ['tipo2']),          // Principal / Dependente
      email:      this._colIdx(header, ['email', 'e-mail']),
      telefone:   this._colIdx(header, ['telefone', 'phone', 'tel', 'celular']),
      nascimento: this._colIdx(header, ['data_nascimento', 'nascimento', 'data_nasc', 'birthdate', 'birth_date'])
    };

    if (col.nome === -1)
      throw new Error('Coluna "nome" não encontrada. Verifique o cabeçalho da planilha.');

    const people = [];
    for (let i = 1; i < rows.length; i++) {
      const r   = rows[i];
      const name = String(r[col.nome] ?? '').trim();
      if (!name) continue;

      const voucher   = String(r[col.voucher]    ?? '').trim();
      const tipoRaw   = String(r[col.tipo]       ?? '').trim();
      const tipo2     = String(r[col.tipo2]      ?? '').trim();
      const email     = String(r[col.email]      ?? '').trim();
      const telefone  = String(r[col.telefone]   ?? '').trim();
      const nascRaw   = this._extractDate(r[col.nascimento]);

      const gender = this._parseGender(tipoRaw);
      const { age, ageLabel } = this._calcAge(nascRaw);

      people.push({
        id:         this._nextId++,
        voucher,
        name,
        gender,                        // 'M' | 'F' | null
        tipo:       tipoRaw,
        tipo2,
        email:      email === 'null' ? '' : email,
        telefone,
        nascimento: nascRaw,
        age,                           // number | null
        ageLabel                       // "35 anos" | "—"
      });
    }

    if (people.length === 0) throw new Error('Nenhum participante encontrado na planilha.');
    this.participants = people;
    return people;
  }

  filterByAge(minAge) {
    if (!minAge) return [...this.participants];
    const min = Number(minAge);
    return this.participants.filter(p => p.age !== null && p.age >= min);
  }

  get stats() {
    const p        = this.participants;
    const total    = p.length;
    const male     = p.filter(x => x.gender === 'M').length;
    const female   = p.filter(x => x.gender === 'F').length;
    const vouchers = new Set(p.map(x => x.voucher).filter(Boolean)).size;
    const ages     = p.map(x => x.age).filter(a => a !== null);
    const minAge   = ages.length ? Math.min(...ages) : null;
    const maxAge   = ages.length ? Math.max(...ages) : null;
    return { total, male, female, vouchers, minAge, maxAge };
  }

  clear() {
    this.participants = [];
    this._nextId = 1;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _colIdx(header, options) {
    for (const opt of options) {
      const idx = header.indexOf(opt);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  // Converts whatever SheetJS returns for date cells into "dd/mm/yyyy"
  // Handles: JS Date objects, Excel serial numbers, and string representations
  _extractDate(raw) {
    if (raw === null || raw === undefined || raw === '') return '';

    // JS Date object (SheetJS cellDates: true)
    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) return '';
      const d = String(raw.getDate()).padStart(2, '0');
      const m = String(raw.getMonth() + 1).padStart(2, '0');
      const y = raw.getFullYear();
      return `${d}/${m}/${y}`;
    }

    // Excel serial date number (e.g. 44927 = 2023-01-01)
    if (typeof raw === 'number' && raw > 1 && raw < 2958466) {
      // Adjust for Excel's leap-year 1900 bug
      const days = raw > 59 ? raw - 1 : raw;
      const ms   = (days - 25568) * 86400000; // days since Unix epoch
      const date = new Date(ms);
      const d = String(date.getUTCDate()).padStart(2, '0');
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const y = date.getUTCFullYear();
      return `${d}/${m}/${y}`;
    }

    return String(raw).trim();
  }

  _parseGender(raw) {
    const v = (raw || '').toLowerCase().trim();
    if (['m', 'masculino', 'homem', 'male', 'h', 'masc'].includes(v)) return 'M';
    if (['f', 'feminino', 'mulher', 'female', 'fem'].includes(v)) return 'F';
    return null;
  }

  _calcAge(dateStr) {
    if (!dateStr || dateStr === 'null') return { age: null, ageLabel: '—' };

    let d, m, y;

    // dd/mm/yyyy  or  d/m/yyyy
    let match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      [, d, m, y] = match;
    } else {
      // yyyy-mm-dd (ISO)
      match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match) {
        [, y, m, d] = match;
      } else {
        // mm/dd/yyyy (US format that SheetJS sometimes returns for CSVs)
        match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        // Same regex as first — but if month > 12 it's clearly d/m; handle below
        if (!match) return { age: null, ageLabel: '—' };
        [, d, m, y] = match;
      }
    }

    // Sanity: if "month" parsed > 12, the order is likely d/m, swap
    if (+m > 12 && +d <= 12) { [d, m] = [m, d]; }

    const birth = new Date(+y, +m - 1, +d);
    if (isNaN(birth.getTime()) || +y < 1900 || +y > new Date().getFullYear())
      return { age: null, ageLabel: '—' };

    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const md = now.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--;

    if (age < 0 || age > 130) return { age: null, ageLabel: '—' };
    return { age, ageLabel: `${age} anos` };
  }
}
