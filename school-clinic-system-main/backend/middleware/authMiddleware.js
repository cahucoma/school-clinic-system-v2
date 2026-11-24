const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Access Denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }

    try {
        const [users] = await pool.query(
            'SELECT user_id, role, account_status FROM users WHERE user_id = ? LIMIT 1',
            [decoded.userId]
        );
        if (users.length === 0) {
            return res.status(401).json({ message: 'Account no longer exists.' });
        }
        if (users[0].account_status !== 'active') {
            return res.status(403).json({ message: 'This account is inactive.' });
        }
        if (users[0].role !== decoded.role) {
            return res.status(401).json({ message: 'Account permissions have changed. Please log in again.' });
        }
        req.user = { userId: users[0].user_id, role: users[0].role };
        next();
    } catch (error) {
        console.error('Account authorization lookup failed:', error);
        return res.status(503).json({ message: 'Authentication is temporarily unavailable.' });
    }
};

const verifyRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access Denied. Insufficient permissions.' });
        }
        next();
    };
};

module.exports = { verifyToken, verifyRole };
