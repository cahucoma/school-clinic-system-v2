const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const {
    isValidEmail,
    isValidIsoDate,
    isValidTimeRange,
    isNonEmptyText,
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

exports.canTransitionAppointmentStatus = canTransitionAppointmentStatus;
exports.isValidScheduleRange = isValidScheduleRange;
