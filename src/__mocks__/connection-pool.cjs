let seq = 0;

class ConnectionPool {
  constructor(cfg) {
    this.cfg = cfg;
    this.active = false;
    this.conns = new Map();
  }

  async initialize() {
    this.active = true;
  }

  async acquire() {
    const id = `conn-${++seq}`;
    const c = { id, db: global.testDb || null, inUse: true, created: Date.now(), lastUsed: Date.now() };
    this.conns.set(id, c);
    return c;
  }

  release(c) {
    if (c) {
      c.inUse = false;
      c.lastUsed = Date.now();
    }
  }

  async shutdown() {
    this.conns.clear();
    this.active = false;
  }
}

module.exports = { ConnectionPool };
