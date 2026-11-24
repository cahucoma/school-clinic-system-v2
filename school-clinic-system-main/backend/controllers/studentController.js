const pool = require('../config/db');
const { isValidEmail, isValidIsoDate, isValidStudentNumber, isNonEmptyText } = require('../utils/validation');

exports.updateProfile = async (req, res) => {
    const userId = req.user.userId;
    const { contactNumber, firstName, lastName, dob, studentNumber } = req.body || {};
    if (typeof contactNumber !== 'string'
        || contactNumber.trim().length < 7
        || contactNumber.trim().length > 20
        || !/^[0-9+(). -]+$/.test(contactNumber.trim())) {
        return res.status(400).json({ message: 'Enter a valid contact number.' });
    }

    if (firstName !== undefined && !isNonEmptyText(firstName, 100)
        || lastName !== undefined && !isNonEmptyText(lastName, 100)
        || dob !== undefined && (!isValidIsoDate(dob) || dob >= new Date().toISOString().slice(0, 10))
        || studentNumber !== undefined && !isValidStudentNumber(studentNumber)) {
        return res.status(400).json({ message: 'Enter valid student profile details.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [students] = await connection.query(
            'SELECT student_id FROM students WHERE user_id = ? FOR UPDATE',
            [userId]
        );
        if (students.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Student not found.' });
        }
        await connection.query(`
            UPDATE students
            SET contact_number = ?,
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                dob = COALESCE(?, dob),
                student_number = COALESCE(?, student_number)
            WHERE student_id = ?
        `, [
            contactNumber.trim(),
            firstName?.trim() || null,
            lastName?.trim() || null,
            dob || null,
            studentNumber?.trim() || null,
            students[0].student_id,
        ]);
        await connection.commit();
        return res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'That student number is already in use.' });
        }
        console.error('Error updating student profile:', error);
        res.status(500).json({ message: 'Unable to update your profile at this time.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getProfile = async (req, res) => {
    const userId = req.user.userId;
    try {
        const [student] = await pool.query(`
            SELECT s.*, u.email, u.profile_picture_url 
            FROM students s 
            JOIN users u ON s.user_id = u.user_id 
            WHERE s.user_id = ?
        `, [userId]);
        
        if (student.length === 0) return res.status(404).json({ message: 'Student not found' });
        
        res.json(student[0]);
    } catch (error) {
        console.error('Error fetching student profile:', error);
        res.status(500).json({ message: 'Unable to fetch your profile at this time.' });
    }
};

async function getOwnStudentId(userId) {
    const [students] = await pool.query(
        'SELECT student_id FROM students WHERE user_id = ? LIMIT 1',
        [userId]
    );
    return students[0]?.student_id || null;
}

exports.getOwnProfileById = async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isSafeInteger(studentId) || studentId < 1) {
        return res.status(400).json({ message: 'A valid student id is required.' });
    }
    const ownStudentId = await getOwnStudentId(req.user.userId);
    if (!ownStudentId) return res.status(404).json({ message: 'Student not found.' });
    if (ownStudentId !== studentId) {
        return res.status(403).json({ message: 'You can only access your own student profile.' });
    }
    return exports.getProfile(req, res);
};

exports.updateOwnProfileById = async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isSafeInteger(studentId) || studentId < 1) {
        return res.status(400).json({ message: 'A valid student id is required.' });
    }
    const ownStudentId = await getOwnStudentId(req.user.userId);
    if (!ownStudentId) return res.status(404).json({ message: 'Student not found.' });
    if (ownStudentId !== studentId) {
        return res.status(403).json({ message: 'You can only update your own student profile.' });
    }
    return exports.updateProfile(req, res);
};
