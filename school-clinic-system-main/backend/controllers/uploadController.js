const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/db');
const crypto = require('crypto');

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    // In production, EC2 IAM roles will automatically provide credentials.
    // Locally, you can set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env
});

exports.uploadProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        const extensions = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
        };
        const extension = extensions[req.file.mimetype];
        const buffer = req.file.buffer;
        const validImage = extension === 'png'
            ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : extension === 'jpg'
                ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
                : extension === 'webp'
                    ? buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
                    : false;
        if (!validImage) {
            return res.status(400).json({ message: 'Upload a valid JPEG, PNG, or WebP image.' });
        }

        const bucketName = process.env.AWS_S3_BUCKET_NAME;
        if (!bucketName) {
            return res.status(503).json({ message: 'Profile image storage is not configured.' });
        }

        const userId = req.user.userId;
        const fileName = `${userId}-${crypto.randomBytes(8).toString('hex')}.${extension}`;

        const params = {
            Bucket: bucketName,
            Key: `profile-pictures/${fileName}`,
            Body: buffer,
            ContentType: req.file.mimetype,
        };

        const command = new PutObjectCommand(params);
        await s3.send(command);

        // The URL of the uploaded object
        const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/profile-pictures/${fileName}`;

        // Update the user in the database
        await pool.query('UPDATE users SET profile_picture_url = ? WHERE user_id = ?', [fileUrl, userId]);

        res.json({ message: 'Profile picture uploaded successfully', url: fileUrl });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Unable to upload the profile picture at this time.' });
    }
};
