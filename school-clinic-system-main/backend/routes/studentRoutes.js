const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const recordController = require('../controllers/recordController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/me/medical-history', verifyToken, verifyRole(['student']), recordController.getStudentRecords);
router.get('/me', verifyToken, verifyRole(['student']), studentController.getProfile);
router.put('/me', verifyToken, verifyRole(['student']), studentController.updateProfile);
router.get('/:id', verifyToken, verifyRole(['student']), studentController.getProfile);
router.put('/:id', verifyToken, verifyRole(['student']), studentController.updateProfile);

module.exports = router;
