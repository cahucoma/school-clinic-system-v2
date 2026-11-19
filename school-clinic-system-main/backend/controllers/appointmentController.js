const pool = require('../config/db');
const { isValidIsoDate, isValidTimeRange, isNonEmptyText } = require('../utils/validation');

exports.getAvailableSlots = async (req, res) => {
    try {
        const [slots] = await pool.query(`
            SELECT t.*, s.first_name as staff_first_name, s.last_name as staff_last_name 
            FROM time_slots t 
            JOIN staff s ON t.staff_id = s.staff_id 
            WHERE t.is_booked = FALSE
              AND (t.slot_date > CURRENT_DATE()
                   OR (t.slot_date = CURRENT_DATE() AND t.start_time > CURRENT_TIME()))
            ORDER BY t.slot_date, t.start_time
        `);
        res.json(slots);
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
        const [slots] = await connection.query(
            `SELECT slot_id, is_booked FROM time_slots
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
            'UPDATE time_slots SET is_booked = FALSE WHERE slot_id = ? AND slot_date >= CURRENT_DATE()',
            [appointments[0].slot_id]
        );
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
            WHERE staff_id = ? AND is_booked = FALSE
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
            SELECT a.status
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
            [appointmentData[0].student_user_id, 'Your appointment was cancelled by clinic staff. The reserved clinic slot will remain unavailable.']
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
