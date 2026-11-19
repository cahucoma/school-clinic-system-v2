const pool = require('../config/db');

exports.getNotifications = async (req, res) => {
    const userId = req.user.userId;
    try {
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Unable to fetch notifications.' });
    }
};

exports.markAsRead = async (req, res) => {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ message: 'A valid notification id is required.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Notification not found.' });
        }
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error updating notification:', error);
        res.status(500).json({ message: 'Unable to update this notification.' });
    }
};
