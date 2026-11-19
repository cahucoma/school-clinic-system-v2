const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const recordRoutes = require('./routes/recordRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const pool = require('./config/db');
const { ensureDefaultAdmin } = require('./services/defaultAdmin');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.includes(origin));
    }
}));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});
app.use(express.json({ limit: '16kb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/', (req, res) => {
    res.send('School Clinic API is running');
});

app.use((error, req, res, next) => {
    console.error('Unhandled API error:', error);
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Request body is too large.' });
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Profile images must be 5 MB or smaller.' });
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ message: 'Request body must contain valid JSON.' });
    }
    return res.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 500)
        .json({ message: 'The request could not be completed.' });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await ensureDefaultAdmin();
        return app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Unable to initialize the default admin:', error);
        await pool.end();
        process.exitCode = 1;
        return null;
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
