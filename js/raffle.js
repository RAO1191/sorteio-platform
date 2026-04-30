class GeneralRaffle {
  constructor() {
    this.drawnIds = new Set();
    this.history  = [];
    this.isAnimating = false;
  }

  getPool(allParticipants) {
    return allParticipants.filter(p => !this.drawnIds.has(p.id));
  }

  draw(allParticipants, prizeName) {
    const pool = this.getPool(allParticipants);
    if (pool.length === 0) return null;

    const winner = pool[Math.floor(Math.random() * pool.length)];
    this.drawnIds.add(winner.id);

    const entry = {
      num:   this.history.length + 1,
      id:    winner.id,
      name:  winner.name,
      age:   winner.ageLabel,
      gender: winner.gender,
      voucher: winner.voucher,
      tipo2: winner.tipo2,
      prize: prizeName || '',
      time:  new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    this.history.push(entry);
    return { winner, entry };
  }

  undoLast() {
    if (this.history.length === 0) return;
    const last = this.history.pop();
    this.drawnIds.delete(last.id);
    return last;
  }

  reset() {
    this.drawnIds.clear();
    this.history = [];
  }
}
