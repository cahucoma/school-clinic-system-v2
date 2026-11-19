const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function isValidEmail(value) {
    return typeof value === 'string'
        && value.length <= 255
        && EMAIL_PATTERN.test(value.trim());
}

function isValidIsoDate(value) {
    if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
    return typeof value === 'string' && TIME_PATTERN.test(value);
}

function isValidTimeRange(startTime, endTime) {
    if (!isValidTime(startTime) || !isValidTime(endTime)) return false;
    const toSeconds = (value) => {
        const [hours, minutes, seconds = '0'] = value.split(':');
        return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
    };
    return toSeconds(startTime) < toSeconds(endTime);
}

function isNonEmptyText(value, maxLength) {
    return typeof value === 'string'
        && value.trim().length > 0
        && value.trim().length <= maxLength;
}

module.exports = {
    isValidEmail,
    isValidIsoDate,
    isValidTime,
    isValidTimeRange,
    isNonEmptyText,
};
