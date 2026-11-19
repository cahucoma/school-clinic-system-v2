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

        console.log('Database migration completed. Existing appointment records were preserved.');
        await pool.end();
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
