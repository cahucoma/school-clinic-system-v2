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
router.get('/settings', verifyToken, verifyRole(['admin']), adminController.getSettings);
router.put('/settings', verifyToken, verifyRole(['admin']), adminController.updateSettings);
router.get('/reschedule-requests', verifyToken, verifyRole(['admin']), adminController.getRescheduleRequests);
router.put('/reschedule-requests/:id/review', verifyToken, verifyRole(['admin']), adminController.reviewRescheduleRequest);
router.get('/students', verifyToken, verifyRole(['admin']), adminController.listStudents);
router.post('/students', verifyToken, verifyRole(['admin']), adminController.createStudent);
router.put('/students/:id', verifyToken, verifyRole(['admin']), adminController.updateStudent);
router.put('/students/:id/status', verifyToken, verifyRole(['admin']), adminController.setStudentStatus);
router.get('/accounts', verifyToken, verifyRole(['admin']), adminController.listAccounts);
router.put('/accounts/:id/status', verifyToken, verifyRole(['admin']), adminController.setAccountStatus);
router.put('/accounts/:id/role', verifyToken, verifyRole(['admin']), adminController.updateAccountRole);

module.exports = router;
