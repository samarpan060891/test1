// Test bootstrap: stub the db module BEFORE the app is required, and mint JWTs.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.NODE_ENV = 'test';

const path = require('path');
const jwt = require('jsonwebtoken');

const DB_PATH = path.resolve(__dirname, '../src/db/index.js');

// Queue-based db stub: tests push handlers; each db.query() call consumes
// the first handler whose matcher accepts the SQL (or the next unconditional one).
const state = { handlers: [], log: [] };

const stub = {
  query: async (text, params) => {
    state.log.push({ text, params });
    for (let i = 0; i < state.handlers.length; i++) {
      const h = state.handlers[i];
      if (!h.match || h.match(text, params)) {
        if (!h.sticky) state.handlers.splice(i, 1);
        const out = typeof h.result === 'function' ? h.result(text, params) : h.result;
        return { rows: out?.rows ?? [], rowCount: out?.rowCount ?? (out?.rows?.length ?? 0) };
      }
    }
    // Default: empty result — keeps notification/side-effect queries harmless
    return { rows: [], rowCount: 0 };
  },
  getClient: async () => ({
    query: stub.query,
    release: () => {},
  }),
  pool: { on: () => {} },
};

require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: stub };

// Now safe to require the app (routes will get the stub)
const app = require('../src/app');

function tokenFor(role, extra = {}) {
  return jwt.sign(
    { user_id: '00000000-0000-4000-8000-00000000000' + (extra.n || '1'),
      name: `${role} user`, email: `${role}@test.local`, role, ...extra },
    process.env.JWT_SECRET
  );
}

function onQuery(match, result, opts = {}) {
  state.handlers.push({ match, result, sticky: opts.sticky || false });
}

function reset() {
  state.handlers.length = 0;
  state.log.length = 0;
}

module.exports = { app, tokenFor, onQuery, reset, queryLog: state.log };
