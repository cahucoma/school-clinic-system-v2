const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/slots', verifyToken, verifyRole(['student']), appointmentController.getAvailableSlots);
router.get('/me', verifyToken, verifyRole(['student']), appointmentController.getStudentAppointments);
router.post('/book', verifyToken, verifyRole(['student']), appointmentController.bookAppointment);
router.put('/:id/cancel', verifyToken, verifyRole(['student']), appointmentController.cancelByStudent);
router.post('/:id/reschedule-request', verifyToken, verifyRole(['student']), appointmentController.requestReschedule);
router.get('/reschedule-requests/me', verifyToken, verifyRole(['student']), appointmentController.getRescheduleRequests);
router.get('/staff-appointments', verifyToken, verifyRole(['staff']), appointmentController.getStaffAppointments);
router.get('/staff-slots', verifyToken, verifyRole(['staff']), appointmentController.getStaffSlots);
router.post('/slots/add', verifyToken, verifyRole(['staff']), appointmentController.createTimeSlot);
router.put('/:id/cancel-by-staff', verifyToken, verifyRole(['staff']), appointmentController.cancelByStaff);

module.exports = router;
