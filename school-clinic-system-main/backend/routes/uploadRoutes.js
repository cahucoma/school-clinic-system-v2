const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { verifyToken } = require('../middleware/authMiddleware');
const multer = require('multer');

// Configure multer to use memory storage so we can stream directly to S3
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            const error = new Error('Only JPEG, PNG, and WebP images are allowed.');
            error.statusCode = 400;
            cb(error, false);
        }
    }
});

router.post('/profile-picture', verifyToken, upload.single('profilePicture'), uploadController.uploadProfilePicture);

module.exports = router;
