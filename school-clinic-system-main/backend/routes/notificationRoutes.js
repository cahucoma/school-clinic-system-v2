const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/me', verifyToken, verifyRole(['student']), notificationController.getNotifications);
router.get('/:userId', verifyToken, verifyRole(['student']), notificationController.getNotifications);
router.put('/:id/read', verifyToken, verifyRole(['student']), notificationController.markAsRead);

module.exports = router;
