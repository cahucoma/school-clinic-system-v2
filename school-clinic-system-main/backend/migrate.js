const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

async function migrate() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'schoolclinic_db',
        });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                notification_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS appointment_history (
                history_id INT AUTO_INCREMENT PRIMARY KEY,
                appointment_id INT NOT NULL,
                action ENUM('status_changed', 'rescheduled') NOT NULL,
                previous_status ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'completed') DEFAULT NULL,
                new_status ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'completed') DEFAULT NULL,
                previous_slot_id INT DEFAULT NULL,
                new_slot_id INT DEFAULT NULL,
                changed_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE CASCADE,
                FOREIGN KEY (previous_slot_id) REFERENCES time_slots(slot_id) ON DELETE RESTRICT,
                FOREIGN KEY (new_slot_id) REFERENCES time_slots(slot_id) ON DELETE RESTRICT,
                FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
                INDEX idx_appointment_history_appointment (appointment_id, created_at)
            )
        `);

        const [studentDuplicates] = await pool.query(`
            SELECT user_id
            FROM students
            GROUP BY user_id
            HAVING COUNT(*) > 1
            LIMIT 1
        `);
        if (studentDuplicates.length === 0) {
            const [studentIndexes] = await pool.query('SHOW INDEX FROM students');
            if (!studentIndexes.some((index) => index.Column_name === 'user_id' && Number(index.Non_unique) === 0)) {
                await pool.query('CREATE UNIQUE INDEX uq_students_user_id ON students (user_id)');
            }
        }

        const [staffDuplicates] = await pool.query(`
            SELECT user_id
            FROM staff
            GROUP BY user_id
            HAVING COUNT(*) > 1
            LIMIT 1
        `);
        if (staffDuplicates.length === 0) {
            const [staffIndexes] = await pool.query('SHOW INDEX FROM staff');
            if (!staffIndexes.some((index) => index.Column_name === 'user_id' && Number(index.Non_unique) === 0)) {
                await pool.query('CREATE UNIQUE INDEX uq_staff_user_id ON staff (user_id)');
            }
        }

        const [notificationIndexes] = await pool.query('SHOW INDEX FROM notifications');
        if (!notificationIndexes.some((index) => index.Key_name === 'idx_notifications_user_read')) {
            await pool.query(
                'CREATE INDEX idx_notifications_user_read ON notifications (user_id, is_read, created_at)'
            );
        }

        const [indexes] = await pool.query('SHOW INDEX FROM appointments');
        const hasNonUniqueSlotIndex = indexes.some((index) =>
            index.Column_name === 'slot_id' && Number(index.Non_unique) === 1
        );
        if (!hasNonUniqueSlotIndex) {
            await pool.query('CREATE INDEX idx_appointments_slot_id ON appointments (slot_id)');
        }

        const uniqueSlotIndex = indexes.find((index) =>
            index.Key_name !== 'PRIMARY'
            && index.Column_name === 'slot_id'
            && Number(index.Non_unique) === 0
        );
        if (uniqueSlotIndex) {
            const indexName = uniqueSlotIndex.Key_name.replace(/`/g, '``');
            await pool.query(`ALTER TABLE appointments DROP INDEX \`${indexName}\``);
        }

        const [statusColumns] = await pool.query("SHOW COLUMNS FROM appointments LIKE 'status'");
        if (!statusColumns[0].Type.includes("'rejected'")) {
            await pool.query(`
                ALTER TABLE appointments
                MODIFY COLUMN status ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'completed')
                NULL DEFAULT 'pending'
            `);
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS clinic_settings (
                setting_key VARCHAR(50) PRIMARY KEY,
                setting_value VARCHAR(100) NOT NULL,
                updated_by INT DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL
            )
        `);
        await pool.query(`
            INSERT IGNORE INTO clinic_settings (setting_key, setting_value) VALUES
                ('opening_time', '08:00'),
                ('closing_time', '17:00'),
                ('appointment_duration_minutes', '30'),
                ('max_daily_appointments', '50')
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reschedule_requests (
                request_id INT AUTO_INCREMENT PRIMARY KEY,
                appointment_id INT NOT NULL,
                requested_slot_id INT NOT NULL,
                reason TEXT,
                status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
                requested_by INT NOT NULL,
                reviewed_by INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP NULL DEFAULT NULL,
                FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE CASCADE,
                FOREIGN KEY (requested_slot_id) REFERENCES time_slots(slot_id) ON DELETE RESTRICT,
                FOREIGN KEY (requested_by) REFERENCES users(user_id) ON DELETE RESTRICT,
                FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
                INDEX idx_reschedule_requests_status (status, created_at)
            )
        `);

        const [userColumns] = await pool.query("SHOW COLUMNS FROM users");
        if (!userColumns.some((column) => column.Field === 'account_status')) {
            await pool.query(
                "ALTER TABLE users ADD COLUMN account_status ENUM('active', 'inactive') NOT NULL DEFAULT 'active' AFTER profile_picture_url"
            );
        }
        if (!userColumns.some((column) => column.Field === 'password_changed_at')) {
            await pool.query(
                'ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT NULL AFTER account_status'
            );
        }
        await pool.query(
            'CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, account_status)'
        ).catch(async () => {
            const [indexes] = await pool.query('SHOW INDEX FROM users');
            if (!indexes.some((index) => index.Key_name === 'idx_users_role_status')) {
                await pool.query('CREATE INDEX idx_users_role_status ON users (role, account_status)');
            }
        });

        console.log('Database migration completed. Existing appointment records were preserved.');
        await pool.end();
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
