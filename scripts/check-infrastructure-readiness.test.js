const test = require('node:test');
const assert = require('node:assert/strict');
const {
  postgresSsl,
  verifyRuntimeRole,
  postgresFailure,
  readinessFailed,
} = require('./check-infrastructure-readiness');

const runtimeIdentity = {
  role: 'orbafun_runtime',
  version: '17',
  tokens: 1,
  trades: 2,
  metadata_rows: 1,
  rolsuper: false,
  rolbypassrls: false,
};

test('fails closed when the runtime password is missing', () => {
  const result = verifyRuntimeRole(runtimeIdentity, 'orbafun_runtime', undefined);
  assert.equal(result.ok, false);
  assert.equal(result.connected, true);
  assert.equal(result.credential_mode, 'migration');
  assert.match(result.error, /POSTGRES_RUNTIME_PASSWORD is not set/);
});

test('fails when PostgreSQL resolves to the wrong role', () => {
  const result = verifyRuntimeRole(
    { ...runtimeIdentity, role: 'orbafun' },
    'orbafun_runtime',
    'runtime-password',
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Connected as orbafun instead of orbafun_runtime/);
});

test('fails for superuser and RLS-bypass runtime roles', () => {
  for (const elevated of [
    { rolsuper: true, rolbypassrls: false },
    { rolsuper: false, rolbypassrls: true },
  ]) {
    const result = verifyRuntimeRole(
      { ...runtimeIdentity, ...elevated },
      'orbafun_runtime',
      'runtime-password',
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /elevated privileges/);
  }
});

test('passes only for the exact least-privilege runtime role', () => {
  const result = verifyRuntimeRole(runtimeIdentity, 'orbafun_runtime', 'runtime-password');
  assert.equal(result.ok, true);
  assert.equal(result.runtime_role_verified, true);
  assert.equal(result.error, undefined);
});

test('keeps Redis failure in the readiness exit decision', () => {
  assert.equal(readinessFailed({ ok: true }, { ok: false }), true);
  assert.equal(readinessFailed({ ok: true }, { ok: true }), false);
});

test('keeps strict remote TLS and the actionable certificate error', () => {
  assert.equal(postgresSsl('localhost'), false);
  assert.deepEqual(postgresSsl('db.example.com'), { rejectUnauthorized: true });
  assert.deepEqual(
    postgresSsl('db.example.com', Buffer.from('test-ca').toString('base64')),
    { rejectUnauthorized: true, ca: 'test-ca' },
  );
  assert.match(postgresFailure(new Error('self-signed certificate')).error, /do not disable verification/);
  assert.equal(postgresFailure(new Error('connection refused')).error, 'connection refused');
});
