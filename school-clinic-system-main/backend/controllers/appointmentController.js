const pool = require('../config/db');
const { isValidIsoDate, isValidTimeRange, isNonEmptyText } = require('../utils/validation');

async function getClinicSettings(connection = pool) {
    const [rows] = await connection.query(
        'SELECT setting_key, setting_value FROM clinic_settings'
    );
    const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
    return {
        openingTime: settings.opening_time || '08:00',
        closingTime: settings.closing_time || '17:00',
        appointmentDurationMinutes: Number(settings.appointment_duration_minutes || 30),
        maxDailyAppointments: Number(settings.max_daily_appointments || 50),
    };
}

function timeInRange(timeValue, openingTime, closingTime) {
    const normalize = (value) => String(value).slice(0, 5);
    return normalize(timeValue) >= openingTime && normalize(timeValue) <= closingTime;
}

exports.getAvailableSlots = async (req, res) => {
    try {
        const settings = await getClinicSettings();
        const [slots] = await pool.query(`
            SELECT t.*, s.first_name as staff_first_name, s.last_name as staff_last_name
            FROM time_slots t 
            JOIN staff s ON t.staff_id = s.staff_id 
            WHERE t.is_booked = FALSE
              AND (t.slot_date > CURRENT_DATE()
                   OR (t.slot_date = CURRENT_DATE() AND t.start_time > CURRENT_TIME()))
            ORDER BY t.slot_date, t.start_time
        `);
        res.json(slots.filter((slot) =>
            timeInRange(slot.start_time, settings.openingTime, settings.closingTime)
            && timeInRange(slot.end_time, settings.openingTime, settings.closingTime)
        ));
    } catch (error) {
        console.error('Error fetching available slots:', error);
        res.status(500).json({ message: 'Unable to fetch available appointments.' });
    }
};

exports.bookAppointment = async (req, res) => {
    const userId = req.user.userId;
    const { slotId, reason } = req.body || {};
    const parsedSlotId = Number(slotId);

    if (!Number.isSafeInteger(parsedSlotId) || parsedSlotId < 1) {
        return res.status(400).json({ message: 'A valid slotId is required' });
    }

    if (!isNonEmptyText(reason, 2000)) {
        return res.status(400).json({ message: 'Enter an appointment reason of 1 to 2000 characters.' });
    }

    let connection;
    let transactionStarted = false;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const [students] = await connection.query(
            'SELECT student_id FROM students WHERE user_id = ? FOR UPDATE',
            [userId]
        );
        if (students.length === 0) {
            const error = new Error('Not a student');
            error.statusCode = 403;
            throw error;
        }

        const studentId = students[0].student_id;
        const settings = await getClinicSettings(connection);
        const [slots] = await connection.query(
            `SELECT slot_id, is_booked, slot_date, start_time, end_time FROM time_slots
             WHERE slot_id = ?
               AND (slot_date > CURRENT_DATE()
                    OR (slot_date = CURRENT_DATE() AND start_time > CURRENT_TIME()))
             FOR UPDATE`,
            [parsedSlotId]
        );
        if (slots.length === 0) {
            const error = new Error('Time slot not found');
            error.statusCode = 404;
            throw error;
        }

        if (!timeInRange(slots[0].start_time, settings.openingTime, settings.closingTime)
            || !timeInRange(slots[0].end_time, settings.openingTime, settings.closingTime)) {
            const error = new Error('This schedule is outside clinic operating hours');
            error.statusCode = 409;
            throw error;
        }

        await connection.query(
            `SELECT setting_value FROM clinic_settings
             WHERE setting_key = 'max_daily_appointments'
             FOR UPDATE`
        );

        const [dailyCount] = await connection.query(`
            SELECT COUNT(*) AS active_count
            FROM appointments a
            JOIN time_slots t ON t.slot_id = a.slot_id
            WHERE t.slot_date = ?
              AND a.status IN ('pending', 'confirmed')
        `, [slots[0].slot_date]);
        if (Number(dailyCount[0].active_count) >= settings.maxDailyAppointments) {
            const error = new Error('The maximum number of appointments for this date has been reached');
            error.statusCode = 409;
            throw error;
        }

        const [duplicateAppointments] = await connection.query(
            `SELECT appointment_id
             FROM appointments
             WHERE student_id = ? AND slot_id = ? AND status IN ('pending', 'confirmed')
             LIMIT 1`,
            [studentId, parsedSlotId]
        );
        if (duplicateAppointments.length > 0) {
            const error = new Error('You already have an active appointment for this time slot');
            error.statusCode = 409;
            throw error;
        }

        const [existingAppointments] = await connection.query(
            'SELECT appointment_id FROM appointments WHERE slot_id = ? AND status IN (?, ?) LIMIT 1',
            [parsedSlotId, 'pending', 'confirmed']
        );
        if (slots[0].is_booked || existingAppointments.length > 0) {
            const error = new Error('This time slot is no longer available');
            error.statusCode = 409;
            throw error;
        }

        await connection.query(
            'INSERT INTO appointments (student_id, slot_id, reason) VALUES (?, ?, ?)',
            [studentId, parsedSlotId, reason.trim()]
        );

        const [updateResult] = await connection.query(
            `UPDATE time_slots SET is_booked = TRUE
             WHERE slot_id = ? AND is_booked = FALSE
               AND (slot_date > CURRENT_DATE()
                    OR (slot_date = CURRENT_DATE() AND start_time > CURRENT_TIME()))`,
            [parsedSlotId]
        );
        if (updateResult.affectedRows !== 1) {
            const error = new Error('This time slot is no longer available');
            error.statusCode = 409;
            throw error;
        }

        const [staffAndStudent] = await connection.query(`
            SELECT st.user_id AS student_user_id, sf.user_id AS staff_user_id
            FROM time_slots t
            JOIN staff sf ON sf.staff_id = t.staff_id
            JOIN students st ON st.student_id = ?
            WHERE t.slot_id = ?
            LIMIT 1
        `, [studentId, parsedSlotId]);
        if (staffAndStudent.length > 0) {
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [staffAndStudent[0].student_user_id, 'Your clinic appointment request has been submitted.']
            );
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [staffAndStudent[0].staff_user_id, 'A new student appointment request has been received.']
            );
        }

        await connection.commit();
        transactionStarted = false;
        return res.status(201).json({ message: 'Appointment booked successfully' });
    } catch (error) {
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error rolling back appointment booking:', rollbackError);
                error = rollbackError;
            }
        }

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This time slot is no longer available' });
        }
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error('Error booking appointment:', error);
        return res.status(500).json({ message: 'Unable to book this appointment at this time.' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

exports.getStudentAppointments = async (req, res) => {
    try {
        const [appointments] = await pool.query(`
            SELECT a.appointment_id, a.reason, a.status, a.created_at,
                   a.slot_id,
                   t.slot_date, t.start_time, t.end_time,
                   s.first_name AS staff_first_name, s.last_name AS staff_last_name,
                   s.specialization, s.room_number
            FROM appointments a
            JOIN students st ON a.student_id = st.student_id
            JOIN time_slots t ON a.slot_id = t.slot_id
            JOIN staff s ON t.staff_id = s.staff_id
            WHERE st.user_id = ?
            ORDER BY t.slot_date DESC, t.start_time DESC
        `, [req.user.userId]);
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching student appointments:', error);
        res.status(500).json({ message: 'Unable to fetch your appointments.' });
    }
};

exports.cancelByStudent = async (req, res) => {
    const appointmentId = Number(req.params.id);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
        return res.status(400).json({ message: 'A valid appointment id is required.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [appointments] = await connection.query(`
            SELECT a.appointment_id, a.slot_id, a.status
            FROM appointments a
            JOIN students st ON a.student_id = st.student_id
            WHERE a.appointment_id = ? AND st.user_id = ?
            FOR UPDATE
        `, [appointmentId, req.user.userId]);
        if (appointments.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Appointment not found.' });
        }
        if (!['pending', 'confirmed'].includes(appointments[0].status)) {
            await connection.rollback();
            return res.status(409).json({ message: 'Only active appointments can be cancelled.' });
        }

        await connection.query(
            'UPDATE appointments SET status = ? WHERE appointment_id = ?',
            ['cancelled', appointmentId]
        );
        await connection.query(
            `UPDATE time_slots
             SET is_booked = FALSE
             WHERE slot_id = ?
               AND slot_date >= CURRENT_DATE()
               AND NOT EXISTS (
                   SELECT 1 FROM appointments
                   WHERE slot_id = ? AND status IN ('pending', 'confirmed')
               )`,
            [appointments[0].slot_id, appointments[0].slot_id]
        );
        await connection.query(`
            INSERT INTO appointment_history
                (appointment_id, action, previous_status, new_status, previous_slot_id, new_slot_id, changed_by)
            VALUES (?, 'status_changed', ?, 'cancelled', ?, ?, ?)
        `, [
            appointmentId,
            appointments[0].status,
            appointments[0].slot_id,
            appointments[0].slot_id,
            req.user.userId,
        ]);
        const [staffUsers] = await connection.query(`
            SELECT sf.user_id AS staff_user_id
            FROM time_slots t
            JOIN staff sf ON sf.staff_id = t.staff_id
            WHERE t.slot_id = ?
            LIMIT 1
        `, [appointments[0].slot_id]);
        if (staffUsers.length > 0) {
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [staffUsers[0].staff_user_id, 'A student has cancelled an appointment.']
            );
        }
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.userId, 'Your appointment has been cancelled.']
        );
        await connection.commit();
        return res.json({ message: 'Appointment cancelled successfully.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error cancelling student appointment:', error);
        return res.status(500).json({ message: 'Unable to cancel this appointment at this time.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.requestReschedule = async (req, res) => {
    const appointmentId = Number(req.params.id);
    const requestedSlotId = Number(req.body?.slotId);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1
        || !Number.isSafeInteger(requestedSlotId) || requestedSlotId < 1
        || reason.length > 1000) {
        return res.status(400).json({ message: 'Choose a valid appointment and available schedule.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [appointments] = await connection.query(`
            SELECT a.appointment_id, a.slot_id, a.status
            FROM appointments a
            JOIN students st ON st.student_id = a.student_id
            WHERE a.appointment_id = ? AND st.user_id = ?
            FOR UPDATE
        `, [appointmentId, req.user.userId]);
        if (appointments.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Appointment not found.' });
        }
        if (!['pending', 'confirmed'].includes(appointments[0].status)) {
            await connection.rollback();
            return res.status(409).json({ message: 'Only active appointments can be rescheduled.' });
        }
        if (appointments[0].slot_id === requestedSlotId) {
            await connection.rollback();
            return res.status(400).json({ message: 'Choose a different schedule.' });
        }
        const [pending] = await connection.query(`
            SELECT request_id FROM reschedule_requests
            WHERE appointment_id = ? AND status = 'pending'
            LIMIT 1
            FOR UPDATE
        `, [appointmentId]);
        if (pending.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'A reschedule request is already pending.' });
        }
        const [slots] = await connection.query(`
            SELECT slot_id, is_booked, slot_date, start_time, end_time,
                   (slot_date > CURRENT_DATE() OR (slot_date = CURRENT_DATE() AND start_time > CURRENT_TIME())) AS is_future
            FROM time_slots
            WHERE slot_id = ?
            FOR UPDATE
        `, [requestedSlotId]);
        if (slots.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Requested schedule was not found.' });
        }
        const settings = await getClinicSettings(connection);
        if (!slots[0].is_future
            || slots[0].is_booked
            || !timeInRange(slots[0].start_time, settings.openingTime, settings.closingTime)
            || !timeInRange(slots[0].end_time, settings.openingTime, settings.closingTime)) {
            await connection.rollback();
            return res.status(409).json({ message: 'The requested schedule is unavailable or outside clinic hours.' });
        }
        const [active] = await connection.query(`
            SELECT appointment_id FROM appointments
            WHERE slot_id = ? AND status IN ('pending', 'confirmed')
            LIMIT 1
            FOR UPDATE
        `, [requestedSlotId]);
        if (active.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'The requested schedule is no longer available.' });
        }

        await connection.query(`
            INSERT INTO reschedule_requests
                (appointment_id, requested_slot_id, reason, status, requested_by)
            VALUES (?, ?, ?, 'pending', ?)
        `, [appointmentId, requestedSlotId, reason || null, req.user.userId]);
        await connection.commit();
        return res.status(201).json({ message: 'Reschedule request submitted for approval.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Reschedule request error:', error);
        return res.status(500).json({ message: 'Unable to submit this reschedule request.' });
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
                   TIME_FORMAT(ts.end_time, '%H:%i') AS requested_end_time
            FROM reschedule_requests rr
            JOIN appointments a ON a.appointment_id = rr.appointment_id
            JOIN students st ON st.student_id = a.student_id
            JOIN time_slots ts ON ts.slot_id = rr.requested_slot_id
            WHERE st.user_id = ?
            ORDER BY rr.created_at DESC
        `, [req.user.userId]);
        return res.json(requests);
    } catch (error) {
        console.error('Student reschedule request fetch error:', error);
        return res.status(500).json({ message: 'Unable to fetch reschedule requests.' });
    }
};

exports.getStaffAppointments = async (req, res) => {
    const userId = req.user.userId;
    try {
        // Find staff id
        const [staff] = await pool.query('SELECT staff_id FROM staff WHERE user_id = ?', [userId]);
        if (staff.length === 0) return res.status(403).json({ message: 'Not a staff member' });
        
        const staffId = staff[0].staff_id;

        const [appointments] = await pool.query(`
            SELECT a.appointment_id, a.reason, a.status, a.created_at, a.student_id,
                   t.slot_date, t.start_time, t.end_time, t.staff_id,
                   st.first_name as student_first_name, st.last_name as student_last_name, st.student_number
            FROM appointments a
            JOIN time_slots t ON a.slot_id = t.slot_id
            JOIN students st ON a.student_id = st.student_id
            WHERE t.staff_id = ?
            ORDER BY t.slot_date, t.start_time
        `, [staffId]);
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching staff appointments:', error);
        res.status(500).json({ message: 'Unable to fetch staff appointments.' });
    }
};

exports.getStaffSlots = async (req, res) => {
    const userId = req.user.userId;
    try {
        // Find staff id
        const [staff] = await pool.query('SELECT staff_id FROM staff WHERE user_id = ?', [userId]);
        if (staff.length === 0) return res.status(403).json({ message: 'Not a staff member' });
        
        const staffId = staff[0].staff_id;

        const [slots] = await pool.query(`
            SELECT * FROM time_slots 
            WHERE staff_id = ?
              AND is_booked = FALSE
              AND (slot_date > CURRENT_DATE()
                   OR (slot_date = CURRENT_DATE() AND start_time > CURRENT_TIME()))
            ORDER BY slot_date, start_time
        `, [staffId]);
        
        res.json(slots);
    } catch (error) {
        console.error('Error fetching staff slots:', error);
        res.status(500).json({ message: 'Unable to fetch available schedules.' });
    }
};

exports.createTimeSlot = async (req, res) => {
    const userId = req.user.userId;
    const { slotDate, startTime, endTime } = req.body || {};
    if (!isValidIsoDate(slotDate) || !isValidTimeRange(startTime, endTime)) {
        return res.status(400).json({ message: 'Enter a valid date and a start time before the end time.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [staff] = await connection.query('SELECT staff_id FROM staff WHERE user_id = ? FOR UPDATE', [userId]);
        if (staff.length === 0) {
            await connection.rollback();
            return res.status(403).json({ message: 'Not a staff member' });
        }
        
        const staffId = staff[0].staff_id;
        const [futureDate] = await connection.query(
            'SELECT (? > CURRENT_DATE() OR (? = CURRENT_DATE() AND ? > CURRENT_TIME())) AS is_future',
            [slotDate, slotDate, startTime]
        );
        if (!futureDate[0].is_future) {
            await connection.rollback();
            return res.status(400).json({ message: 'Appointments must be scheduled for a future date and time.' });
        }
        const settings = await getClinicSettings(connection);
        const toMinutes = (value) => {
            const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
            return hours * 60 + minutes;
        };
        if (!timeInRange(startTime, settings.openingTime, settings.closingTime)
            || !timeInRange(endTime, settings.openingTime, settings.closingTime)
            || toMinutes(endTime) - toMinutes(startTime) !== settings.appointmentDurationMinutes) {
            await connection.rollback();
            return res.status(409).json({ message: 'This schedule is outside clinic operating hours.' });
        }
        const [overlaps] = await connection.query(`
            SELECT slot_id FROM time_slots
            WHERE staff_id = ? AND slot_date = ?
              AND start_time < ? AND end_time > ?
            LIMIT 1
        `, [staffId, slotDate, endTime, startTime]);
        if (overlaps.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'This schedule overlaps an existing appointment slot.' });
        }

        await connection.query(
            'INSERT INTO time_slots (staff_id, slot_date, start_time, end_time) VALUES (?, ?, ?, ?)',
            [staffId, slotDate, startTime, endTime]
        );

        await connection.commit();
        res.status(201).json({ message: 'Time slot created successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This time slot already exists for you' });
        }
        console.error("Server error creating slot:", error);
        res.status(500).json({ message: 'Unable to create this schedule at this time.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.cancelByStaff = async (req, res) => {
    const appointmentId = Number(req.params.id);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
        return res.status(400).json({ message: 'A valid appointment id is required.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [accessibleAppointments] = await connection.query(`
            SELECT a.status, a.slot_id
            FROM appointments a
            JOIN time_slots t ON a.slot_id = t.slot_id
            JOIN staff sf ON t.staff_id = sf.staff_id
            WHERE a.appointment_id = ? AND sf.user_id = ?
            FOR UPDATE
        `, [appointmentId, req.user.userId]);
        if (accessibleAppointments.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Appointment not found for this staff member.' });
        }
        if (!['pending', 'confirmed'].includes(accessibleAppointments[0].status)) {
            await connection.rollback();
            return res.status(409).json({ message: 'Only active appointments can be cancelled.' });
        }

        await connection.query(
            'UPDATE appointments SET status = "cancelled" WHERE appointment_id = ?',
            [appointmentId]
        );
        await connection.query(`
            INSERT INTO appointment_history
                (appointment_id, action, previous_status, new_status, previous_slot_id, new_slot_id, changed_by)
            VALUES (?, 'status_changed', ?, 'cancelled', ?, ?, ?)
        `, [
            appointmentId,
            accessibleAppointments[0].status,
            accessibleAppointments[0].slot_id,
            accessibleAppointments[0].slot_id,
            req.user.userId,
        ]);
        await connection.query(
            `UPDATE time_slots
             SET is_booked = FALSE
             WHERE slot_id = ?
               AND NOT EXISTS (
                   SELECT 1 FROM appointments
                   WHERE slot_id = ? AND status IN ('pending', 'confirmed')
               )`,
            [accessibleAppointments[0].slot_id, accessibleAppointments[0].slot_id]
        );
        const [appointmentData] = await connection.query(`
            SELECT st.user_id AS student_user_id
            FROM appointments a
            JOIN students st ON a.student_id = st.student_id
            JOIN time_slots t ON a.slot_id = t.slot_id
            JOIN staff sf ON t.staff_id = sf.staff_id
            WHERE a.appointment_id = ? AND sf.user_id = ?
        `, [appointmentId, req.user.userId]);
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [appointmentData[0].student_user_id, 'Your appointment was cancelled by clinic staff.']
        );

        await connection.commit();
        return res.json({ message: 'Appointment cancelled and student notified' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error cancelling staff appointment:', error);
        return res.status(500).json({ message: 'Unable to cancel this appointment at this time.' });
    } finally {
        if (connection) connection.release();
    }
};
