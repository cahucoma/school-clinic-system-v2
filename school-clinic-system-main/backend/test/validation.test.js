const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isValidEmail,
    isValidIsoDate,
    isValidTime,
    isValidTimeRange,
    isNonEmptyText,
} = require('../utils/validation');

test('email validation trims whitespace and enforces a valid address shape', () => {
    assert.equal(isValidEmail(' student@example.edu '), true);
    assert.equal(isValidEmail('student.example.edu'), false);
    assert.equal(isValidEmail('x'.repeat(251) + '@a.io'), false);
});

test('ISO dates must be real calendar dates', () => {
    assert.equal(isValidIsoDate('2024-02-29'), true);
    assert.equal(isValidIsoDate('2025-02-29'), false);
    assert.equal(isValidIsoDate('2025-2-03'), false);
});

test('appointment times use a valid 24-hour clock', () => {
    assert.equal(isValidTime('09:30'), true);
    assert.equal(isValidTime('23:59:59'), true);
    assert.equal(isValidTime('24:00'), false);
    assert.equal(isValidTime('9:30'), false);
});

test('appointment ranges compare actual times even when seconds are omitted', () => {
    assert.equal(isValidTimeRange('09:30', '10:00'), true);
    assert.equal(isValidTimeRange('09:30:00', '09:30'), false);
    assert.equal(isValidTimeRange('10:00', '09:30'), false);
});

test('text validation rejects blank and oversized input', () => {
    assert.equal(isNonEmptyText('  reason  ', 10), true);
    assert.equal(isNonEmptyText('   ', 10), false);
    assert.equal(isNonEmptyText('too long', 3), false);
});
