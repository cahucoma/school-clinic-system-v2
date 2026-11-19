const test = require('node:test');
const assert = require('node:assert/strict');

async function loadSecurityHelpers() {
    return import('../mcp-security.mjs');
}

test('MCP SELECT queries are bounded and permit a modest explicit limit', async () => {
    const { validateReadOnlyQuery } = await loadSecurityHelpers();
    assert.equal(validateReadOnlyQuery('SELECT status FROM appointments'), 'SELECT status FROM appointments LIMIT 100');
    assert.equal(validateReadOnlyQuery('SELECT status FROM appointments LIMIT 25'), 'SELECT status FROM appointments LIMIT 25');
});

test('MCP queries reject writes, multiple statements, and private fields', async () => {
    const { validateReadOnlyQuery } = await loadSecurityHelpers();
    for (const sql of [
        'UPDATE users SET role = "admin"',
        'SELECT user_id FROM users; DROP TABLE users',
        'SELECT email FROM users',
        'SELECT diagnosis FROM medical_records',
        'SELECT user_id FROM users LIMIT 1000',
    ]) {
        assert.throws(() => validateReadOnlyQuery(sql));
    }
});

test('MCP table previews redact private result columns', async () => {
    const { redactPrivateColumns } = await loadSecurityHelpers();
    assert.deepEqual(
        redactPrivateColumns([{ email: 'person@example.edu', role: 'student' }]),
        [{ email: '[REDACTED]', role: 'student' }],
    );
});
