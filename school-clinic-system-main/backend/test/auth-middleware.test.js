const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyRole } = require('../middleware/authMiddleware');

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test('role middleware allows an explicitly permitted role', () => {
    let continued = false;
    verifyRole(['staff'])({ user: { role: 'staff' } }, createResponse(), () => {
        continued = true;
    });
    assert.equal(continued, true);
});

test('role middleware rejects users without a permitted role', () => {
    const response = createResponse();
    verifyRole(['staff'])({ user: { role: 'student' } }, response, () => {
        assert.fail('denied users must not reach the handler');
    });
    assert.equal(response.statusCode, 403);
});
