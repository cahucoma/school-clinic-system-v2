const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/stats', verifyToken, verifyRole(['admin']), adminController.getDashboardStats);
router.post('/staff', verifyToken, verifyRole(['admin']), adminController.addStaff);
router.get('/staff', verifyToken, verifyRole(['admin']), adminController.getStaff);
router.get('/appointments', verifyToken, verifyRole(['admin']), adminController.getAppointments);
router.get('/appointments/:id/history', verifyToken, verifyRole(['admin']), adminController.getAppointmentHistory);
router.put('/appointments/:id/status', verifyToken, verifyRole(['admin']), adminController.updateAppointmentStatus);
router.put('/appointments/:id/reschedule', verifyToken, verifyRole(['admin']), adminController.rescheduleAppointment);
router.get('/schedules', verifyToken, verifyRole(['admin']), adminController.getSchedules);
router.post('/schedules', verifyToken, verifyRole(['admin']), adminController.createSchedule);

module.exports = router;
