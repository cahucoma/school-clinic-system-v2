const pool = require('./config/db');

const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

async function seedTimeSlots() {
    try {
        const [staff] = await pool.query('SELECT staff_id FROM staff ORDER BY staff_id');
        if (staff.length === 0) {
            throw new Error('No clinic staff found. Add a staff member before seeding time slots.');
        }

        const weekdays = [];
        const date = new Date();
        date.setHours(0, 0, 0, 0);

        while (weekdays.length < 5) {
            date.setDate(date.getDate() + 1);
            if (date.getDay() !== 0 && date.getDay() !== 6) {
                weekdays.push(formatDate(date));
            }
        }

        const periods = [
            { start: 8 * 60, end: 11 * 60 + 30 },
            { start: 13 * 60, end: 16 * 60 + 30 },
        ];
        const slots = [];
        const formatTime = (minutes) =>
            `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;

        for (const { staff_id: staffId } of staff) {
            for (const slotDate of weekdays) {
                for (const period of periods) {
                    for (let start = period.start; start < period.end; start += 30) {
                        slots.push([
                            staffId,
                            slotDate,
                            formatTime(start),
                            formatTime(start + 30),
                            false,
                        ]);
                    }
                }
            }
        }

        const [result] = await pool.query(
            `INSERT IGNORE INTO time_slots
                (staff_id, slot_date, start_time, end_time, is_booked)
             VALUES ?`,
            [slots]
        );

        console.log(`Created ${result.affectedRows} available slots for ${staff.length} staff member(s).`);
        console.log(`Dates: ${weekdays.join(', ')}`);
        console.log('Hours: 08:00-11:30 and 13:00-16:30 in 30-minute slots.');
    } finally {
        await pool.end();
    }
}

seedTimeSlots().catch((error) => {
    console.error('Failed to seed sample time slots:', error.message);
    process.exitCode = 1;
});
