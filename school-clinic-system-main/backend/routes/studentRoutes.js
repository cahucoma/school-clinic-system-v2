const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const recordController = require('../controllers/recordController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/me/medical-history', verifyToken, verifyRole(['student']), recordController.getStudentRecords);
router.get('/:id', verifyToken, studentController.getProfile);
router.put('/:id', verifyToken, studentController.updateProfile);

module.exports = router;
