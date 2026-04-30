class GroupRaffle {
  distribute(people, numGroups, groupNames = []) {
    if (people.length === 0) throw new Error('Nenhum participante para distribuir.');
    if (numGroups < 2)       throw new Error('Número mínimo de grupos é 2.');
    if (numGroups > people.length) throw new Error('Número de grupos maior que o número de participantes.');

    const shuffled = this._shuffle(people);

    const totalM = shuffled.filter(p => p.gender === 'M').length;
    const totalF = shuffled.filter(p => p.gender === 'F').length;
    const hasGender = totalM + totalF > 0;

    // Count how many people share each voucher (= family size)
    const voucherSize = {};
    shuffled.forEach(p => {
      if (p.voucher) voucherSize[p.voucher] = (voucherSize[p.voucher] || 0) + 1;
    });

    // Sort: largest families first so they get spread early
    const sorted = [...shuffled].sort((a, b) => {
      const fa = a.voucher ? (voucherSize[a.voucher] || 0) : 0;
      const fb = b.voucher ? (voucherSize[b.voucher] || 0) : 0;
      return fb - fa;
    });

    const groups = Array.from({ length: numGroups }, (_, i) => ({
      id:       i + 1,
      name:     (groupNames[i] || '').trim() || `Grupo ${i + 1}`,
      members:  [],
      vouchers: new Set(),
      maleCount:   0,
      femaleCount: 0
    }));

    const warnings = [];

    for (const person of sorted) {
      // Groups that don't yet have anyone from this voucher (= no family conflict)
      const noConflict = person.voucher
        ? groups.filter(g => !g.vouchers.has(person.voucher))
        : groups;

      if (noConflict.length === 0 && person.voucher) {
        warnings.push(`${person.name} (voucher ${person.voucher}) foi alocado com um familiar — não foi possível evitar.`);
      }

      const pool = noConflict.length > 0 ? noConflict : groups;
      const best = this._pickBest(pool, person, totalM, totalF, numGroups, hasGender);

      best.members.push(person);
      if (person.voucher) best.vouchers.add(person.voucher);
      if (person.gender === 'M') best.maleCount++;
      if (person.gender === 'F') best.femaleCount++;
    }

    return { groups, warnings, totalM, totalF, hasGender, numPeople: people.length };
  }

  exportCSV(result) {
    const rows = [['Grupo', 'Voucher', 'Nome', 'Gênero', 'Tipo', 'Idade', 'E-mail', 'Telefone']];
    for (const g of result.groups) {
      for (const m of g.members) {
        rows.push([
          g.name,
          m.voucher || '',
          m.name,
          m.gender === 'M' ? 'Masculino' : m.gender === 'F' ? 'Feminino' : '',
          m.tipo2 || '',
          m.ageLabel || '',
          m.email || '',
          m.telefone || ''
        ]);
      }
    }
    return '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _pickBest(pool, person, totalM, totalF, numGroups, hasGender) {
    let best = null;
    let bestScore = -Infinity;

    for (const g of pool) {
      let score = 0;

      // Equalise group sizes (strongly prefer smaller groups)
      score -= g.members.length * 100;

      // Gender balance
      if (hasGender && person.gender) {
        if (person.gender === 'M' && totalM > 0) {
          score += (totalM / numGroups - g.maleCount) * 25;
        } else if (person.gender === 'F' && totalF > 0) {
          score += (totalF / numGroups - g.femaleCount) * 25;
        }
      }

      // Tiny noise to break ties randomly
      score += Math.random() * 3;

      if (score > bestScore) { bestScore = score; best = g; }
    }

    return best;
  }
}
