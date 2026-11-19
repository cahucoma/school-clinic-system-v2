const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { isValidEmail, isValidIsoDate, isNonEmptyText } = require('../utils/validation');

exports.register = async (req, res) => {
    const { email, password, firstName, lastName, dob, studentNumber } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!isValidEmail(normalizedEmail)
        || typeof password !== 'string'
        || password.length < 10
        || password.length > 128
        || !isNonEmptyText(firstName, 100)
        || !isNonEmptyText(lastName, 100)
        || !isNonEmptyText(studentNumber, 50)
        || !isValidIsoDate(dob)
        || dob >= new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ message: 'Enter valid student details and a password of at least 10 characters.' });
    }

    let connection;
    let transactionStarted = false;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;
        const [result] = await connection.query(
            'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
            [normalizedEmail, hashedPassword, 'student']
        );
        const userId = result.insertId;
        await connection.query(
            'INSERT INTO students (user_id, student_number, first_name, last_name, dob) VALUES (?, ?, ?, ?, ?)',
            [userId, studentNumber.trim(), firstName.trim(), lastName.trim(), dob]
        );
        await connection.commit();
        transactionStarted = false;
        return res.status(201).json({ message: 'User registered successfully', userId });
    } catch (error) {
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error rolling back student registration:', rollbackError);
            }
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'An account with this email or student number already exists.' });
        }
        console.error('Error registering student:', error);
        return res.status(500).json({ message: 'Unable to register at this time.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!isValidEmail(normalizedEmail) || typeof password !== 'string' || password.length === 0 || password.length > 128) {
        return res.status(400).json({ message: 'Enter a valid email and password.' });
    }

    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET is not configured.');
        return res.status(503).json({ message: 'Authentication is temporarily unavailable.' });
    }

    try {
        const [users] = await pool.query(
            'SELECT user_id, password_hash, role FROM users WHERE email = ? LIMIT 1',
            [normalizedEmail]
        );
        if (users.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
        
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
        
        const token = jwt.sign({ userId: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, role: user.role, userId: user.user_id });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Unable to log in at this time.' });
    }
};
