const pool = require('../config/db');
const { isNonEmptyText } = require('../utils/validation');

exports.createRecord = async (req, res) => {
    const { studentId, appointmentId, diagnosis, prescription, notes } = req.body || {};
    const parsedStudentId = Number(studentId);
    const parsedAppointmentId = Number(appointmentId);
    if (!Number.isSafeInteger(parsedStudentId) || parsedStudentId < 1
        || !Number.isSafeInteger(parsedAppointmentId) || parsedAppointmentId < 1
        || !isNonEmptyText(diagnosis, 4000)
        || (prescription !== undefined && prescription !== null && (typeof prescription !== 'string' || prescription.length > 4000))
        || (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 4000))) {
        return res.status(400).json({ message: 'Enter valid appointment details and a diagnosis.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const [appointments] = await connection.query(`
                SELECT a.appointment_id, a.status
                FROM appointments a
                JOIN time_slots t ON a.slot_id = t.slot_id
                JOIN staff s ON t.staff_id = s.staff_id
                WHERE a.appointment_id = ? AND a.student_id = ? AND s.user_id = ?
                FOR UPDATE
            `, [parsedAppointmentId, parsedStudentId, req.user.userId]);
            if (appointments.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Appointment not found for this staff member.' });
            }
            if (!['pending', 'confirmed'].includes(appointments[0].status)) {
                await connection.rollback();
                return res.status(409).json({ message: 'This appointment cannot be completed.' });
            }

            await connection.query(
                'INSERT INTO medical_records (student_id, appointment_id, diagnosis, prescription, notes) VALUES (?, ?, ?, ?, ?)',
                [parsedStudentId, parsedAppointmentId, diagnosis.trim(), prescription || null, notes || null]
            );
            
            const [updateResult] = await connection.query(
                'UPDATE appointments SET status = ? WHERE appointment_id = ? AND status IN (?, ?)',
                ['completed', parsedAppointmentId, 'pending', 'confirmed']
            );
            if (updateResult.affectedRows !== 1) {
                await connection.rollback();
                return res.status(409).json({ message: 'This appointment cannot be completed.' });
            }

            await connection.commit();
            res.status(201).json({ message: 'Medical record created successfully' });
        } catch (err) {
            await connection.rollback();
            throw err;
        }
    } catch (error) {
        console.error('Error creating medical record:', error);
        res.status(500).json({ message: 'Unable to save the medical record at this time.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getStudentRecords = async (req, res) => {
    const userId = req.user.userId;
    try {
        // Find the student_id from user_id
        const [student] = await pool.query('SELECT student_id FROM students WHERE user_id = ?', [userId]);
        if (student.length === 0) return res.status(404).json({ message: 'Student not found' });
        
        const actualStudentId = student[0].student_id;

        const [records] = await pool.query(`
            SELECT m.*, 
                   s.first_name as staff_first_name, s.last_name as staff_last_name, s.specialization,
                   t.slot_date
            FROM medical_records m
            JOIN appointments a ON m.appointment_id = a.appointment_id
            JOIN time_slots t ON a.slot_id = t.slot_id
            JOIN staff s ON t.staff_id = s.staff_id
            WHERE m.student_id = ?
            ORDER BY m.created_at DESC
        `, [actualStudentId]);
        
        res.json(records);
    } catch (error) {
        console.error('Error fetching student records:', error);
        res.status(500).json({ message: 'Unable to fetch medical records.' });
    }
};
