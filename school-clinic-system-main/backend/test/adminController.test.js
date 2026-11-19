const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canTransitionAppointmentStatus,
    isValidScheduleRange,
} = require('../controllers/adminController');

test('appointment status transitions only allow valid admin workflow steps', () => {
    assert.equal(canTransitionAppointmentStatus('pending', 'confirmed'), true);
    assert.equal(canTransitionAppointmentStatus('pending', 'rejected'), true);
    assert.equal(canTransitionAppointmentStatus('pending', 'cancelled'), true);
    assert.equal(canTransitionAppointmentStatus('confirmed', 'completed'), true);
    assert.equal(canTransitionAppointmentStatus('confirmed', 'cancelled'), true);
    assert.equal(canTransitionAppointmentStatus('completed', 'confirmed'), false);
    assert.equal(canTransitionAppointmentStatus('rejected', 'completed'), false);
    assert.equal(canTransitionAppointmentStatus('pending', 'completed'), false);
});

test('schedule range accepts valid ordered ranges up to one year', () => {
    assert.equal(isValidScheduleRange('2025-01-01', '2025-12-31'), true);
    assert.equal(isValidScheduleRange('2025-01-01', '2026-01-03'), false);
    assert.equal(isValidScheduleRange('2025-02-02', '2025-02-01'), false);
    assert.equal(isValidScheduleRange('2025-02-30', '2025-03-01'), false);
});
