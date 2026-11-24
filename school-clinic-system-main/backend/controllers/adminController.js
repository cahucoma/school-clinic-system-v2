const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const {
    isValidEmail,
    isValidIsoDate,
    isValidTimeRange,
    isNonEmptyText,
    isValidStudentNumber,
    isValidPassword,
} = require('../utils/validation');

const APPOINTMENT_STATUSES = new Set(['pending', 'confirmed', 'rejected', 'cancelled', 'completed']);
const APPOINTMENT_TRANSITIONS = {
    pending: new Set(['confirmed', 'rejected', 'cancelled']),
    confirmed: new Set(['cancelled', 'completed']),
};

function canTransitionAppointmentStatus(currentStatus, nextStatus) {
    return APPOINTMENT_TRANSITIONS[currentStatus]?.has(nextStatus) === true;
}

function isValidScheduleRange(from, to) {
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return false;
    const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    return rangeDays <= 366;
}

exports.getDashboardStats = async (req, res) => {
    try {
        const [studentCount] = await pool.query('SELECT COUNT(*) as count FROM students');
        const [staffCount] = await pool.query('SELECT COUNT(*) as count FROM staff');
        const [appointmentStats] = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM appointments 
            GROUP BY status
        `);
        const [recentAppointments] = await pool.query(`
            SELECT a.appointment_id, a.status, a.created_at,
                   st.first_name as student_first, st.last_name as student_last,
                   sf.first_name as staff_first, sf.last_name as staff_last
            FROM appointments a
            JOIN students st ON a.student_id = st.student_id
            JOIN time_slots t ON a.slot_id = t.slot_id
            JOIN staff sf ON t.staff_id = sf.staff_id
            ORDER BY a.created_at DESC
            LIMIT 5
        `);

        // Format appointment stats into a key-value object
        const appointments = {
            total: 0,
            pending: 0,
            rejected: 0,
            completed: 0,
            cancelled: 0,
            confirmed: 0
        };

        appointmentStats.forEach(stat => {
            appointments[stat.status] = stat.count;
            appointments.total += stat.count;
        });

        res.json({
            students: studentCount[0].count,
            staff: staffCount[0].count,
            appointments,
            recentAppointments
        });
    } catch (error) {
        console.error("Admin stats error:", error);
        res.status(500).json({ message: 'Unable to fetch dashboard statistics.' });
    }
};

exports.addStaff = async (req, res) => {
    const { email, password, firstName, lastName, specialization, roomNumber } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!isValidEmail(normalizedEmail)
        || typeof password !== 'string'
        || password.length < 10
        || password.length > 128
        || !isNonEmptyText(firstName, 100)
        || !isNonEmptyText(lastName, 100)
        || (specialization !== undefined && specialization !== null && (typeof specialization !== 'string' || specialization.length > 150))
        || (roomNumber !== undefined && roomNumber !== null && (typeof roomNumber !== 'string' || roomNumber.length > 20))) {
        return res.status(400).json({ message: 'Enter valid staff details and a password of at least 10 characters.' });
    }

    let connection;
    let transactionStarted = false;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;
        const hashedPassword = await bcrypt.hash(password, 10);
        const [userResult] = await connection.query(
            'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
            [normalizedEmail, hashedPassword, 'staff']
        );
        await connection.query(
            'INSERT INTO staff (user_id, first_name, last_name, specialization, room_number) VALUES (?, ?, ?, ?, ?)',
            [userResult.insertId, firstName.trim(), lastName.trim(), specialization || null, roomNumber || null]
        );
        await connection.commit();
        transactionStarted = false;
        return res.status(201).json({ message: 'Staff member added successfully!' });
    } catch (error) {
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error rolling back staff creation:', rollbackError);
            }
        }
        console.error('Error adding staff member:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'A user with this email already exists' });
        }
        return res.status(500).json({ message: 'Unable to add this staff member at this time.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getAppointments = async (req, res) => {
    const { from, to, status, search } = req.query || {};
    if ((from && !isValidIsoDate(from))
        || (to && !isValidIsoDate(to))
        || (from && to && from > to)
        || (status && status !== 'all' && !APPOINTMENT_STATUSES.has(status))
        || (search !== undefined && (typeof search !== 'string' || search.length > 100))) {
        return res.status(400).json({ message: 'Enter valid appointment filters.' });
    }

    const filters = [];
    const params = [];
    if (from) {
        filters.push('t.slot_date >= ?');
        params.push(from);
    }
    if (to) {
        filters.push('t.slot_date <= ?');
        params.push(to);
    }
    if (status && status !== 'all') {
        filters.push('a.status = ?');
        params.push(status);
    }
    if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        filters.push("(st.first_name LIKE ? OR st.last_name LIKE ? OR CONCAT(st.first_name, ' ', st.last_name) LIKE ? OR st.student_number LIKE ?)");
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    try {
        const [appointments] = await pool.query(`
            SELECT a.appointment_id, a.slot_id, a.reason, a.status, a.created_at,
                   st.first_name AS student_first_name, st.last_name AS student_last_name,
                   st.student_number, sf.first_name AS staff_first_name,
                   sf.last_name AS staff_last_name, sf.staff_id,
                   DATE_FORMAT(t.slot_date, '%Y-%m-%d') AS slot_date,
                   TIME_FORMAT(t.start_time, '%H:%i') AS start_time,
                   TIME_FORMAT(t.end_time, '%H:%i') AS end_time
            FROM appointments a
            JOIN students st ON a.student_id = st.student_id
            JOIN time_slots t ON a.slot_id = t.slot_id
            JOIN staff sf ON t.staff_id = sf.staff_id
            ${whereClause}
            ORDER BY t.slot_date DESC, t.start_time DESC
        `, params);
        res.json(appointments);
    } catch (error) {
        console.error('Admin appointments error:', error);
        res.status(500).json({ message: 'Unable to fetch appointments.' });
    }
};

exports.getSchedules = async (req, res) => {
    const { from, to } = req.query || {};
    if (!isValidScheduleRange(from, to)) {
        return res.status(400).json({ message: 'Select a valid date range of up to one year.' });
    }

    try {
        const [schedules] = await pool.query(`
            SELECT t.slot_id, t.staff_id,
                   CASE
                       WHEN t.is_booked = TRUE OR EXISTS (
                           SELECT 1
                           FROM appointments active_appointment
                           WHERE active_appointment.slot_id = t.slot_id
                             AND active_appointment.status IN ('pending', 'confirmed')
                       ) THEN TRUE
                       ELSE FALSE
                   END AS is_booked,
                   DATE_FORMAT(t.slot_date, '%Y-%m-%d') AS slot_date,
                   TIME_FORMAT(t.start_time, '%H:%i') AS start_time,
                   TIME_FORMAT(t.end_time, '%H:%i') AS end_time,
                   sf.first_name AS staff_first_name, sf.last_name AS staff_last_name,
                   a.appointment_id, a.status, a.reason,
                   st.first_name AS student_first_name, st.last_name AS student_last_name,
                   st.student_number
            FROM time_slots t
            JOIN staff sf ON sf.staff_id = t.staff_id
            LEFT JOIN appointments a ON a.appointment_id = (
                SELECT a2.appointment_id
                FROM appointments a2
                WHERE a2.slot_id = t.slot_id
                ORDER BY
                    CASE WHEN a2.status IN ('pending', 'confirmed') THEN 0 ELSE 1 END,
                    a2.appointment_id DESC
                LIMIT 1
            )
            LEFT JOIN students st ON st.student_id = a.student_id
            WHERE t.slot_date BETWEEN ? AND ?
            ORDER BY t.slot_date, t.start_time, sf.last_name
        `, [from, to]);
        res.json(schedules);
    } catch (error) {
        console.error('Admin schedules error:', error);
        res.status(500).json({ message: 'Unable to fetch clinic schedules.' });
    }
};

exports.getStaff = async (req, res) => {
    try {
        const [staff] = await pool.query(`
            SELECT staff_id, first_name, last_name, specialization, room_number
            FROM staff
            ORDER BY last_name, first_name
        `);
        res.json(staff);
    } catch (error) {
        console.error('Admin staff list error:', error);
        res.status(500).json({ message: 'Unable to fetch clinic staff.' });
    }
};

exports.createSchedule = async (req, res) => {
    const { staffId, slotDate, startTime, endTime } = req.body || {};
    const parsedStaffId = Number(staffId);
    if (!Number.isSafeInteger(parsedStaffId) || parsedStaffId < 1
        || !isValidIsoDate(slotDate) || !isValidTimeRange(startTime, endTime)) {
        return res.status(400).json({ message: 'Enter a valid staff member, date, and time range.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [settingsRows] = await connection.query(
            'SELECT setting_key, setting_value FROM clinic_settings'
        );
        const settings = Object.fromEntries(settingsRows.map((row) => [row.setting_key, row.setting_value]));
        const openingTime = settings.opening_time || '08:00';
        const closingTime = settings.closing_time || '17:00';
        const durationMinutes = Number(settings.appointment_duration_minutes || 30);
        const toMinutes = (value) => {
            const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
            return hours * 60 + minutes;
        };
        if (startTime < openingTime || endTime > closingTime
            || toMinutes(endTime) - toMinutes(startTime) !== durationMinutes) {
            await connection.rollback();
            return res.status(409).json({
                message: `Schedules must fit clinic hours and use the configured ${durationMinutes}-minute duration.`,
            });
        }
        const [staff] = await connection.query(
            'SELECT staff_id FROM staff WHERE staff_id = ? FOR UPDATE',
            [parsedStaffId]
        );
        if (staff.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Clinic staff member not found.' });
        }

        const [futureDate] = await connection.query(
            'SELECT (? > CURRENT_DATE() OR (? = CURRENT_DATE() AND ? > CURRENT_TIME())) AS is_future',
            [slotDate, slotDate, startTime]
        );
        if (!futureDate[0].is_future) {
            await connection.rollback();
            return res.status(400).json({ message: 'Schedules must be created for a future date and time.' });
        }

        const [overlaps] = await connection.query(`
            SELECT slot_id FROM time_slots
            WHERE staff_id = ? AND slot_date = ?
              AND start_time < ? AND end_time > ?
            LIMIT 1
            FOR UPDATE
        `, [parsedStaffId, slotDate, endTime, startTime]);
        if (overlaps.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'This schedule conflicts with an existing time slot.' });
        }

        const [result] = await connection.query(
            'INSERT INTO time_slots (staff_id, slot_date, start_time, end_time) VALUES (?, ?, ?, ?)',
            [parsedStaffId, slotDate, startTime, endTime]
        );
        await connection.commit();
        return res.status(201).json({ message: 'Schedule created successfully.', slotId: result.insertId });
    } catch (error) {
        if (connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This schedule already exists for the selected staff member.' });
        }
        console.error('Admin schedule creation error:', error);
        return res.status(500).json({ message: 'Unable to create this schedule.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.updateAppointmentStatus = async (req, res) => {
    const appointmentId = Number(req.params.id);
    const { status } = req.body || {};
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1
        || !APPOINTMENT_STATUSES.has(status)) {
        return res.status(400).json({ message: 'Choose a valid appointment and status.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [appointments] = await connection.query(`
            SELECT a.status, a.slot_id, st.user_id AS student_user_id,
                   DATE_FORMAT(t.slot_date, '%Y-%m-%d') AS slot_date,
                   TIME_FORMAT(t.start_time, '%H:%i:%s') AS start_time,
                   TIME_FORMAT(t.end_time, '%H:%i:%s') AS end_time
            FROM appointments a
            JOIN students st ON a.student_id = st.student_id
            JOIN time_slots t ON t.slot_id = a.slot_id
            WHERE a.appointment_id = ?
            FOR UPDATE
        `, [appointmentId]);
        if (appointments.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Appointment not found.' });
        }
        const appointment = appointments[0];
        if (!canTransitionAppointmentStatus(appointment.status, status)) {
            await connection.rollback();
            return res.status(409).json({ message: 'This appointment cannot be moved to the selected status.' });
        }
        const [timeState] = await connection.query(
            `SELECT
                (? > CURRENT_DATE() OR (? = CURRENT_DATE() AND ? > CURRENT_TIME())) AS is_future,
                (? < CURRENT_DATE() OR (? = CURRENT_DATE() AND ? <= CURRENT_TIME())) AS has_passed`,
            [
                appointment.slot_date, appointment.slot_date, appointment.start_time,
                appointment.slot_date, appointment.slot_date, appointment.end_time,
            ]
        );
        if (status === 'confirmed' && !timeState[0].is_future) {
            await connection.rollback();
            return res.status(409).json({ message: 'Past appointments cannot be approved.' });
        }
        if (status === 'completed' && !timeState[0].has_passed) {
            await connection.rollback();
            return res.status(409).json({ message: 'An appointment can only be completed after its scheduled time.' });
        }

        await connection.query(
            'UPDATE appointments SET status = ? WHERE appointment_id = ?',
            [status, appointmentId]
        );
        await connection.query(`
            INSERT INTO appointment_history
                (appointment_id, action, previous_status, new_status, previous_slot_id, new_slot_id, changed_by)
            VALUES (?, 'status_changed', ?, ?, ?, ?, ?)
        `, [appointmentId, appointment.status, status, appointment.slot_id, appointment.slot_id, req.user.userId]);
        if (status === 'rejected' || status === 'cancelled') {
            await connection.query(
                `UPDATE time_slots
                 SET is_booked = FALSE
                 WHERE slot_id = ? AND slot_date >= CURRENT_DATE()
                   AND NOT EXISTS (
                       SELECT 1 FROM appointments
                       WHERE slot_id = ? AND status IN ('pending', 'confirmed')
                   )`,
                [appointment.slot_id, appointment.slot_id]
            );
        }
        const messages = {
            confirmed: 'Your appointment has been approved by the clinic.',
            rejected: 'Your appointment was declined by the clinic.',
            cancelled: 'Your appointment has been cancelled by the clinic.',
            completed: 'Your appointment has been marked as completed.',
        };
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [appointment.student_user_id, messages[status]]
        );
        await connection.commit();
        res.json({ message: 'Appointment status updated.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Admin appointment update error:', error);
        res.status(500).json({ message: 'Unable to update this appointment.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.rescheduleAppointment = async (req, res) => {
    const appointmentId = Number(req.params.id);
    const newSlotId = Number(req.body?.slotId);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1
        || !Number.isSafeInteger(newSlotId) || newSlotId < 1) {
        return res.status(400).json({ message: 'Choose a valid appointment and available schedule.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [appointments] = await connection.query(`
            SELECT a.status, a.slot_id, st.user_id AS student_user_id
            FROM appointments a
            JOIN students st ON st.student_id = a.student_id
            WHERE a.appointment_id = ?
            FOR UPDATE
        `, [appointmentId]);
        if (appointments.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Appointment not found.' });
        }

        const appointment = appointments[0];
        if (!['pending', 'confirmed'].includes(appointment.status)) {
            await connection.rollback();
            return res.status(409).json({ message: 'Only active appointments can be rescheduled.' });
        }
        if (Number(appointment.slot_id) === newSlotId) {
            await connection.rollback();
            return res.status(400).json({ message: 'Choose a different schedule.' });
        }

        const [slots] = await connection.query(`
            SELECT slot_id, is_booked,
                   (slot_date > CURRENT_DATE() OR (slot_date = CURRENT_DATE() AND start_time > CURRENT_TIME())) AS is_future
            FROM time_slots
            WHERE slot_id = ?
            FOR UPDATE
        `, [newSlotId]);
        if (slots.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Selected schedule was not found.' });
        }
        const [activeAppointments] = await connection.query(`
            SELECT appointment_id FROM appointments
            WHERE slot_id = ? AND status IN ('pending', 'confirmed')
            LIMIT 1
            FOR UPDATE
        `, [newSlotId]);
        if (slots[0].is_booked || !slots[0].is_future || activeAppointments.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'Selected schedule is no longer available.' });
        }

        await connection.query(
            'UPDATE time_slots SET is_booked = TRUE WHERE slot_id = ? AND is_booked = FALSE',
            [newSlotId]
        );
        await connection.query(
            'UPDATE appointments SET slot_id = ? WHERE appointment_id = ?',
            [newSlotId, appointmentId]
        );
        await connection.query(`
            UPDATE time_slots
            SET is_booked = FALSE
            WHERE slot_id = ? AND slot_date >= CURRENT_DATE()
              AND NOT EXISTS (
                  SELECT 1 FROM appointments
                  WHERE slot_id = ? AND status IN ('pending', 'confirmed')
              )
        `, [appointment.slot_id, appointment.slot_id]);
        await connection.query(`
            INSERT INTO appointment_history
                (appointment_id, action, previous_status, new_status, previous_slot_id, new_slot_id, changed_by)
            VALUES (?, 'rescheduled', ?, ?, ?, ?, ?)
        `, [
            appointmentId,
            appointment.status,
            appointment.status,
            appointment.slot_id,
            newSlotId,
            req.user.userId,
        ]);
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [appointment.student_user_id, 'Your appointment has been rescheduled by the clinic.']
        );

        await connection.commit();
        return res.json({ message: 'Appointment rescheduled successfully.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Admin appointment reschedule error:', error);
        return res.status(500).json({ message: 'Unable to reschedule this appointment.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getSettings = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT setting_key, setting_value FROM clinic_settings'
        );
        const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
        return res.json({
            openingTime: settings.opening_time || '08:00',
            closingTime: settings.closing_time || '17:00',
            appointmentDurationMinutes: Number(settings.appointment_duration_minutes || 30),
            maxDailyAppointments: Number(settings.max_daily_appointments || 50),
        });
    } catch (error) {
        console.error('Clinic settings fetch error:', error);
        return res.status(500).json({ message: 'Unable to fetch clinic settings.' });
    }
};

exports.updateSettings = async (req, res) => {
    const { openingTime, closingTime, appointmentDurationMinutes, maxDailyAppointments } = req.body || {};
    const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
    const duration = Number(appointmentDurationMinutes);
    const dailyLimit = Number(maxDailyAppointments);
    if (!TIME_PATTERN.test(openingTime || '') || !TIME_PATTERN.test(closingTime || '')
        || openingTime >= closingTime
        || !Number.isInteger(duration) || duration < 5 || duration > 240
        || !Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 500) {
        return res.status(400).json({
            message: 'Choose valid opening/closing hours, a 5–240 minute duration, and a daily limit from 1 to 500.',
        });
    }

    const values = {
        opening_time: openingTime,
        closing_time: closingTime,
        appointment_duration_minutes: String(duration),
        max_daily_appointments: String(dailyLimit),
    };
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        for (const [settingKey, settingValue] of Object.entries(values)) {
            await connection.query(`
                INSERT INTO clinic_settings (setting_key, setting_value, updated_by)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
            `, [settingKey, settingValue, req.user.userId]);
        }
        await connection.commit();
        return res.json({ message: 'Clinic appointment settings updated.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Clinic settings update error:', error);
        return res.status(500).json({ message: 'Unable to update clinic settings.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getRescheduleRequests = async (req, res) => {
    try {
        const [requests] = await pool.query(`
            SELECT rr.request_id, rr.appointment_id, rr.requested_slot_id, rr.reason,
                   rr.status, rr.created_at, rr.reviewed_at,
                   DATE_FORMAT(ts.slot_date, '%Y-%m-%d') AS requested_date,
                   TIME_FORMAT(ts.start_time, '%H:%i') AS requested_start_time,
                   TIME_FORMAT(ts.end_time, '%H:%i') AS requested_end_time,
                   sf.first_name AS staff_first_name, sf.last_name AS staff_last_name,
                   st.first_name AS student_first_name, st.last_name AS student_last_name,
                   st.student_number
            FROM reschedule_requests rr
            JOIN appointments a ON a.appointment_id = rr.appointment_id
            JOIN students st ON st.student_id = a.student_id
            JOIN time_slots ts ON ts.slot_id = rr.requested_slot_id
            JOIN staff sf ON sf.staff_id = ts.staff_id
            ORDER BY rr.created_at DESC
        `);
        return res.json(requests);
    } catch (error) {
        console.error('Reschedule request fetch error:', error);
        return res.status(500).json({ message: 'Unable to fetch reschedule requests.' });
    }
};

exports.reviewRescheduleRequest = async (req, res) => {
    const requestId = Number(req.params.id);
    const decision = req.body?.status;
    if (!Number.isSafeInteger(requestId) || requestId < 1
        || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ message: 'Choose a valid request and review decision.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [requests] = await connection.query(`
            SELECT rr.request_id, rr.appointment_id, rr.requested_slot_id, rr.status,
                   a.status AS appointment_status, a.slot_id AS previous_slot_id,
                   st.user_id AS student_user_id
            FROM reschedule_requests rr
            JOIN appointments a ON a.appointment_id = rr.appointment_id
            JOIN students st ON st.student_id = a.student_id
            WHERE rr.request_id = ?
            FOR UPDATE
        `, [requestId]);
        if (requests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Reschedule request not found.' });
        }
        const request = requests[0];
        if (request.status !== 'pending') {
            await connection.rollback();
            return res.status(409).json({ message: 'This reschedule request has already been reviewed.' });
        }
        if (!['pending', 'confirmed'].includes(request.appointment_status)) {
            await connection.rollback();
            return res.status(409).json({ message: 'The appointment is no longer active.' });
        }

        if (decision === 'approved') {
            const [slots] = await connection.query(`
                SELECT slot_id, is_booked,
                       (slot_date > CURRENT_DATE() OR (slot_date = CURRENT_DATE() AND start_time > CURRENT_TIME())) AS is_future
                FROM time_slots
                WHERE slot_id = ?
                FOR UPDATE
            `, [request.requested_slot_id]);
            const [active] = await connection.query(`
                SELECT appointment_id FROM appointments
                WHERE slot_id = ? AND status IN ('pending', 'confirmed')
                LIMIT 1
                FOR UPDATE
            `, [request.requested_slot_id]);
            if (slots.length === 0 || !slots[0].is_future || slots[0].is_booked || active.length > 0) {
                await connection.rollback();
                return res.status(409).json({ message: 'The requested schedule is no longer available.' });
            }
            await connection.query(
                'UPDATE time_slots SET is_booked = TRUE WHERE slot_id = ?',
                [request.requested_slot_id]
            );
            await connection.query(
                'UPDATE appointments SET slot_id = ? WHERE appointment_id = ?',
                [request.requested_slot_id, request.appointment_id]
            );
            await connection.query(`
                UPDATE time_slots
                SET is_booked = FALSE
                WHERE slot_id = ? AND NOT EXISTS (
                    SELECT 1 FROM appointments
                    WHERE slot_id = ? AND status IN ('pending', 'confirmed')
                )
            `, [request.previous_slot_id, request.previous_slot_id]);
            await connection.query(`
                INSERT INTO appointment_history
                    (appointment_id, action, previous_status, new_status, previous_slot_id, new_slot_id, changed_by)
                VALUES (?, 'rescheduled', ?, ?, ?, ?, ?)
            `, [
                request.appointment_id,
                request.appointment_status,
                request.appointment_status,
                request.previous_slot_id,
                request.requested_slot_id,
                req.user.userId,
            ]);
        }

        await connection.query(
            'UPDATE reschedule_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE request_id = ?',
            [decision, req.user.userId, requestId]
        );
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [request.student_user_id, decision === 'approved'
                ? 'Your reschedule request was approved.'
                : 'Your reschedule request was rejected.']
        );
        await connection.commit();
        return res.json({ message: decision === 'approved' ? 'Reschedule request approved.' : 'Reschedule request rejected.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Reschedule request review error:', error);
        return res.status(500).json({ message: 'Unable to review this reschedule request.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getAppointmentHistory = async (req, res) => {
    const appointmentId = Number(req.params.id);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
        return res.status(400).json({ message: 'A valid appointment id is required.' });
    }

    try {
        const [history] = await pool.query(`
            SELECT h.history_id, h.action, h.previous_status, h.new_status, h.created_at,
                   DATE_FORMAT(old_slot.slot_date, '%Y-%m-%d') AS previous_date,
                   TIME_FORMAT(old_slot.start_time, '%H:%i') AS previous_start_time,
                   TIME_FORMAT(old_slot.end_time, '%H:%i') AS previous_end_time,
                   DATE_FORMAT(new_slot.slot_date, '%Y-%m-%d') AS new_date,
                   TIME_FORMAT(new_slot.start_time, '%H:%i') AS new_start_time,
                   TIME_FORMAT(new_slot.end_time, '%H:%i') AS new_end_time
            FROM appointment_history h
            LEFT JOIN time_slots old_slot ON old_slot.slot_id = h.previous_slot_id
            LEFT JOIN time_slots new_slot ON new_slot.slot_id = h.new_slot_id
            WHERE h.appointment_id = ?
            ORDER BY h.created_at DESC, h.history_id DESC
        `, [appointmentId]);
        res.json(history);
    } catch (error) {
        console.error('Admin appointment history error:', error);
        res.status(500).json({ message: 'Unable to fetch appointment history.' });
    }
};

exports.listStudents = async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || '10', 10) || 10));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const status = req.query.status || 'all';
    const sort = ['student_number', 'first_name', 'last_name', 'created_at'].includes(req.query.sort)
        ? req.query.sort
        : 'created_at';
    const order = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    if (!['all', 'active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Choose a valid account status filter.' });
    }

    const filters = ["u.role = 'student'"];
    const params = [];
    if (search) {
        filters.push('(s.student_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR u.email LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term, term);
    }
    if (status !== 'all') {
        filters.push('u.account_status = ?');
        params.push(status);
    }
    const sortColumn = {
        student_number: 's.student_number',
        first_name: 's.first_name',
        last_name: 's.last_name',
        created_at: 'u.created_at',
    }[sort];

    try {
        const [[countRow]] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM students s
            JOIN users u ON u.user_id = s.user_id
            WHERE ${filters.join(' AND ')}
        `, params);
        const [rows] = await pool.query(`
            SELECT s.student_id, s.user_id, s.student_number, s.first_name, s.last_name,
                   s.dob, s.contact_number, u.email, u.profile_picture_url,
                   u.account_status, u.created_at
            FROM students s
            JOIN users u ON u.user_id = s.user_id
            WHERE ${filters.join(' AND ')}
            ORDER BY ${sortColumn} ${order}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        const total = Number(countRow.total);
        return res.json({
            students: rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Student account list error:', error);
        return res.status(500).json({ message: 'Unable to fetch student accounts.' });
    }
};

exports.createStudent = async (req, res) => {
    const { email, password, firstName, lastName, dob, studentNumber, contactNumber } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!isValidEmail(normalizedEmail)
        || !isValidPassword(password)
        || !isNonEmptyText(firstName, 100)
        || !isNonEmptyText(lastName, 100)
        || !isValidIsoDate(dob)
        || dob >= new Date().toISOString().slice(0, 10)
        || !isValidStudentNumber(studentNumber)
        || (contactNumber !== undefined && contactNumber !== null
            && (typeof contactNumber !== 'string'
                || contactNumber.trim().length < 7
                || contactNumber.trim().length > 20
                || !/^[0-9+(). -]+$/.test(contactNumber.trim())))) {
        return res.status(400).json({
            message: 'Enter valid student details, a valid student number, and a strong password.',
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const passwordHash = await bcrypt.hash(password, 12);
        const [existing] = await connection.query(
            'SELECT user_id FROM users WHERE email = ? LIMIT 1',
            [normalizedEmail]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'A user with this email already exists.' });
        }
        const [existingNumber] = await connection.query(
            'SELECT student_id FROM students WHERE student_number = ? LIMIT 1',
            [studentNumber.trim()]
        );
        if (existingNumber.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'This student number is already in use.' });
        }
        const [userResult] = await connection.query(
            "INSERT INTO users (email, password_hash, role, account_status) VALUES (?, ?, 'student', 'active')",
            [normalizedEmail, passwordHash]
        );
        await connection.query(
            'INSERT INTO students (user_id, student_number, first_name, last_name, dob, contact_number) VALUES (?, ?, ?, ?, ?, ?)',
            [userResult.insertId, studentNumber.trim(), firstName.trim(), lastName.trim(), dob, contactNumber?.trim() || null]
        );
        await connection.commit();
        return res.status(201).json({ message: 'Student account created successfully.' });
    } catch (error) {
        if (connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email or student number is already in use.' });
        }
        console.error('Create student account error:', error);
        return res.status(500).json({ message: 'Unable to create the student account.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.updateStudent = async (req, res) => {
    const studentId = Number(req.params.id);
    const { firstName, lastName, dob, studentNumber, contactNumber } = req.body || {};
    if (!Number.isSafeInteger(studentId) || studentId < 1
        || !isNonEmptyText(firstName, 100)
        || !isNonEmptyText(lastName, 100)
        || !isValidIsoDate(dob)
        || dob >= new Date().toISOString().slice(0, 10)
        || !isValidStudentNumber(studentNumber)
        || (contactNumber !== undefined && contactNumber !== null
            && (typeof contactNumber !== 'string'
                || contactNumber.trim().length < 7
                || contactNumber.trim().length > 20
                || !/^[0-9+(). -]+$/.test(contactNumber.trim())))) {
        return res.status(400).json({ message: 'Enter valid student profile details.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [students] = await connection.query(
            'SELECT student_id, user_id FROM students WHERE student_id = ? FOR UPDATE',
            [studentId]
        );
        if (students.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Student account not found.' });
        }
        const [duplicates] = await connection.query(
            'SELECT student_id FROM students WHERE student_number = ? AND student_id <> ? LIMIT 1',
            [studentNumber.trim(), studentId]
        );
        if (duplicates.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'This student number is already in use.' });
        }
        await connection.query(`
            UPDATE students
            SET first_name = ?, last_name = ?, dob = ?, student_number = ?, contact_number = ?
            WHERE student_id = ?
        `, [
            firstName.trim(),
            lastName.trim(),
            dob,
            studentNumber.trim(),
            contactNumber?.trim() || null,
            studentId,
        ]);
        await connection.commit();
        return res.json({ message: 'Student account updated successfully.' });
    } catch (error) {
        if (connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This student number is already in use.' });
        }
        console.error('Update student account error:', error);
        return res.status(500).json({ message: 'Unable to update the student account.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.setStudentStatus = async (req, res) => {
    const studentId = Number(req.params.id);
    const status = req.body?.status;
    if (!Number.isSafeInteger(studentId) || studentId < 1
        || !['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Choose a valid student account status.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [students] = await connection.query(
            'SELECT user_id FROM students WHERE student_id = ? FOR UPDATE',
            [studentId]
        );
        if (students.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Student account not found.' });
        }
        await connection.query(
            'UPDATE users SET account_status = ? WHERE user_id = ?',
            [status, students[0].user_id]
        );
        await connection.commit();
        return res.json({
            message: status === 'active' ? 'Student account activated.' : 'Student account deactivated.',
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Update student status error:', error);
        return res.status(500).json({ message: 'Unable to update student account status.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.listAccounts = async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || '10', 10) || 10));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const role = req.query.role || 'all';
    const status = req.query.status || 'all';
    const sort = ['email', 'role', 'created_at'].includes(req.query.sort) ? req.query.sort : 'created_at';
    const order = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    if (!['all', 'student', 'staff', 'admin'].includes(role)
        || !['all', 'active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Choose valid account filters.' });
    }
    const filters = [];
    const params = [];
    if (search) {
        filters.push('u.email LIKE ?');
        params.push(`%${search}%`);
    }
    if (role !== 'all') {
        filters.push('u.role = ?');
        params.push(role);
    }
    if (status !== 'all') {
        filters.push('u.account_status = ?');
        params.push(status);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const sortColumn = { email: 'u.email', role: 'u.role', created_at: 'u.created_at' }[sort];
    try {
        const [[countRow]] = await pool.query(
            `SELECT COUNT(*) AS total FROM users u ${where}`,
            params
        );
        const [rows] = await pool.query(`
            SELECT u.user_id, u.email, u.role, u.account_status, u.password_changed_at, u.created_at,
                   CASE
                       WHEN u.role = 'student' THEN s.first_name
                       WHEN u.role = 'staff' THEN sf.first_name
                       ELSE NULL
                   END AS first_name,
                   CASE
                       WHEN u.role = 'student' THEN s.last_name
                       WHEN u.role = 'staff' THEN sf.last_name
                       ELSE NULL
                   END AS last_name
            FROM users u
            LEFT JOIN students s ON s.user_id = u.user_id
            LEFT JOIN staff sf ON sf.user_id = u.user_id
            ${where}
            ORDER BY ${sortColumn} ${order}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        const total = Number(countRow.total);
        return res.json({
            accounts: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Account list error:', error);
        return res.status(500).json({ message: 'Unable to fetch accounts.' });
    }
};

exports.setAccountStatus = async (req, res) => {
    const userId = Number(req.params.id);
    const status = req.body?.status;
    if (!Number.isSafeInteger(userId) || userId < 1
        || !['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Choose a valid account status.' });
    }
    if (userId === req.user.userId && status === 'inactive') {
        return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }
    try {
        const [users] = await pool.query(
            'SELECT role FROM users WHERE user_id = ? LIMIT 1',
            [userId]
        );
        if (users.length === 0) {
            return res.status(404).json({ message: 'Account not found.' });
        }
        if (users[0].role === 'admin' && status === 'inactive') {
            const [[adminCount]] = await pool.query(
                "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND account_status = 'active'"
            );
            if (Number(adminCount.count) <= 1) {
                return res.status(409).json({ message: 'At least one active administrator must remain.' });
            }
        }
        await pool.query(
            'UPDATE users SET account_status = ? WHERE user_id = ?',
            [status, userId]
        );
        return res.json({ message: status === 'active' ? 'Account activated.' : 'Account deactivated.' });
    } catch (error) {
        console.error('Account status error:', error);
        return res.status(500).json({ message: 'Unable to update account status.' });
    }
};

exports.updateAccountRole = async (req, res) => {
    const userId = Number(req.params.id);
    const role = req.body?.role;
    if (!Number.isSafeInteger(userId) || userId < 1
        || !['student', 'staff', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Choose a valid account role.' });
    }
    if (userId === req.user.userId) {
        return res.status(400).json({ message: 'You cannot change your own role.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [users] = await connection.query(
            'SELECT role, account_status FROM users WHERE user_id = ? FOR UPDATE',
            [userId]
        );
        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Account not found.' });
        }
        if (users[0].role === 'admin' && role !== 'admin') {
            const [[adminCount]] = await connection.query(
                "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND account_status = 'active'"
            );
            if (Number(adminCount.count) <= 1) {
                await connection.rollback();
                return res.status(409).json({ message: 'At least one active administrator must remain.' });
            }
        }
        if (users[0].role === 'student' && role !== 'student') {
            await connection.rollback();
            return res.status(409).json({
                message: 'Student accounts cannot change roles while a student profile exists. Deactivate the account instead.',
            });
        }
        if (users[0].role !== 'student' && role === 'student') {
            await connection.rollback();
            return res.status(409).json({
                message: 'Use student account creation to add a student profile; a role change alone cannot create one.',
            });
        }
        if (users[0].role === 'admin' && role === 'staff') {
            const [staffProfiles] = await connection.query(
                'SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1',
                [userId]
            );
            if (staffProfiles.length === 0) {
                await connection.rollback();
                return res.status(409).json({
                    message: 'Create a clinic staff profile before changing this account to staff.',
                });
            }
        }
        await connection.query('UPDATE users SET role = ? WHERE user_id = ?', [role, userId]);
        await connection.commit();
        return res.json({ message: 'Account role updated successfully.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Account role update error:', error);
        return res.status(500).json({ message: 'Unable to update account role.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.canTransitionAppointmentStatus = canTransitionAppointmentStatus;
exports.isValidScheduleRange = isValidScheduleRange;
