# Database Architecture & Guide 🗄️

The database is built on **MySQL** and follows a heavily normalized, relational structure designed to maintain data integrity and support complex queries.

## Schema Overview

The database (`schoolclinic_db`) consists of 8 interconnected tables:

### 1. `users`
The core identity table. Every person who logs into the system (Student, Staff, Admin) has a row here.
- Handles authentication (`email`, `password_hash`).
- Defines the authorization level (`role`).

### 2. `students` & 3. `staff`
These tables store the specific profile details for the different roles.
- They both have a Foreign Key (`user_id`) pointing back to the `users` table.
- `students` stores `student_number`, `dob`, etc.
- `staff` stores `specialization`, `room_number`, etc.

### 4. `time_slots`
Manages a doctor's availability.
- Links to the `staff` table via `staff_id`.
- Stores the date and time blocks.
- Contains an `is_booked` boolean flag to prevent double-booking.
- Appointment slots are locked during booking; staff schedule creation checks for time overlaps.

### 5. `appointments`
The central transactional table linking students to doctors.
- Links to `students` (`student_id`).
- Links to `time_slots` (`slot_id`).
- Manages the state of the visit (`status`: pending, confirmed, rejected, completed, cancelled).
- Cancelled appointments remain in the history while future cancelled/declined slots can be booked again.
- Admin reschedules retain their previous and new slot references in `appointment_history`.

### 6. `medical_records`
Created by doctors upon completing an appointment.
- Links to the `appointments` table (`appointment_id`).
- Links to the `students` table (`student_id`).
- Stores the `diagnosis`, `prescription`, and `notes`.

### 7. `notifications`
Stores real-time alerts for users.
- Links to the `users` table (`user_id`).
- Driven heavily by the Appointment cancellation workflow.

### 8. `appointment_history`
An append-only audit trail for administrator appointment changes.
- Records status transitions and rescheduling events.
- Links each event to its appointment, previous/new time slots, and the admin user who made the change.

## Entity Relationship Summary
- A **User** can be exactly one **Student** OR one **Staff**.
- A **Staff** member can have many **Time Slots**.
- A **Student** can book many **Appointments**.
- An **Appointment** belongs to exactly one **Time Slot**.
- An **Appointment** can result in exactly one **Medical Record**.
- A **User** can receive many **Notifications**.
- An **Appointment** can have many **Appointment History** entries.

## Execution and Setup
To initialize this database on a new machine:
1. Open your MySQL client (e.g., MySQL Workbench, DBeaver, or command line).
2. Connect to your local or cloud MySQL instance.
3. Open the `backend/schema.sql` file.
4. Execute the entire file. It is written idempotently (`IF NOT EXISTS`), so it is safe to run multiple times.

For an existing database, run `npm run migrate` from the backend directory. This additive migration creates `appointment_history`, adds the rejected status when needed, removes only the unique index on `appointments.slot_id`, keeps all existing records, and retains a normal index for appointment lookups and the foreign key.
