const express = require('express');
const router = express.Router();
const recordController = require('../controllers/recordController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.post('/add', verifyToken, verifyRole(['staff']), recordController.createRecord);
router.get('/student/:studentId', verifyToken, verifyRole(['student']), recordController.getStudentRecords);

module.exports = router;
