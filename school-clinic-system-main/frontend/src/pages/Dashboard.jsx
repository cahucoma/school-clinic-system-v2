import React, { useState, useEffect } from 'react';
import { IconCalendarEvent, IconClock, IconUser, IconStethoscope, IconLogout, IconSettings, IconBell, IconX } from '@tabler/icons-react';
import api from '../utils/api';
import { useAuth } from '../context/auth';

const Dashboard = () => {
    const [slots, setSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(true);
    const [slotsError, setSlotsError] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [appointmentsError, setAppointmentsError] = useState('');
    const [records, setRecords] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [contactNumber, setContactNumber] = useState('');
    const [profilePictureFile, setProfilePictureFile] = useState(null);
    const [uploadingPic, setUploadingPic] = useState(false);
    const [profile, setProfile] = useState(null);
    const [bookingSlot, setBookingSlot] = useState(null);
    const [bookingReason, setBookingReason] = useState('');
    const [bookingLoading, setBookingLoading] = useState(false);
    const [appointmentNotice, setAppointmentNotice] = useState(null);
    const [rescheduleAppointment, setRescheduleAppointment] = useState(null);
    const [rescheduleSlotId, setRescheduleSlotId] = useState('');
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [rescheduleLoading, setRescheduleLoading] = useState(false);
    const [rescheduleRequests, setRescheduleRequests] = useState([]);
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const { logout, user } = useAuth();
    
    const fetchSlots = async () => {
        try {
            const response = await api.get('/appointments/slots');
            setSlots(response.data);
            setSlotsError('');
        } catch (error) {
            console.error("Failed to fetch slots:", error);
            setSlotsError(error.response?.data?.message || 'Unable to load appointment times.');
        } finally {
            setSlotsLoading(false);
        }
    };

    const fetchAppointments = async () => {
        try {
            const response = await api.get('/appointments/me');
            setAppointments(response.data);
            setAppointmentsError('');
        } catch (error) {
            console.error('Failed to fetch appointments:', error);
            setAppointmentsError(error.response?.data?.message || 'Unable to load your appointments.');
        }
    };

    useEffect(() => {
        const fetchRecords = async () => {
            try {
                const response = await api.get('/students/me/medical-history');
                setRecords(response.data);
            } catch (error) {
                console.error("Failed to fetch records:", error);
            }
        };

        const fetchNotifications = async () => {
            try {
                const response = await api.get(`/notifications/me`);
                setNotifications(response.data);
            } catch (error) {
                console.error("Failed to fetch notifications:", error);
            }
        };

        const fetchProfile = async () => {
            try {
                const response = await api.get(`/students/me`);
                setProfile(response.data);
                setContactNumber(response.data.contact_number || '');
            } catch (error) {
                console.error('Failed to fetch profile:', error);
            }
        };
        const fetchRescheduleRequests = async () => {
            try {
                const response = await api.get('/appointments/reschedule-requests/me');
                setRescheduleRequests(response.data);
            } catch (error) {
                console.error('Failed to fetch reschedule requests:', error);
            }
        };

        fetchSlots();
        if (user?.role === 'student') {
            fetchAppointments();
            fetchRecords();
            fetchNotifications();
            fetchProfile();
            fetchRescheduleRequests();
            
            // Poll for notifications every 5 seconds
            const interval = setInterval(fetchNotifications, 5000);
            return () => clearInterval(interval);
        }
    }, [user?.role, user?.userId]);

    const handleBookSlot = async (slotId) => {
        setBookingSlot(slotId);
        setBookingReason('');
        setAppointmentNotice(null);
    };

    const submitBooking = async (event) => {
        event.preventDefault();
        if (!bookingReason.trim()) {
            setAppointmentNotice({ type: 'error', text: 'Enter a reason for your visit.' });
            return;
        }
        setBookingLoading(true);
        try {
            await api.post('/appointments/book', {
                slotId: bookingSlot,
                reason: bookingReason
            });
            setAppointmentNotice({ type: 'success', text: 'Appointment booked successfully.' });
            setBookingSlot(null);
            await Promise.all([fetchSlots(), fetchAppointments()]);
        } catch (error) {
            setAppointmentNotice({ type: 'error', text: error.response?.data?.message || 'Unable to book appointment.' });
        } finally {
            setBookingLoading(false);
        }
    };

    const handleCancelAppointment = async (appointmentId) => {
        if (!window.confirm('Cancel this appointment? An upcoming slot will become available to another student.')) return;
        try {
            await api.put(`/appointments/${appointmentId}/cancel`);
            setAppointmentNotice({ type: 'success', text: 'Appointment cancelled successfully.' });
            await Promise.all([fetchSlots(), fetchAppointments()]);
        } catch (error) {
            setAppointmentNotice({ type: 'error', text: error.response?.data?.message || 'Failed to cancel appointment.' });
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            await api.put('/students/me', { contactNumber });
            
            if (profilePictureFile) {
                setUploadingPic(true);
                const formData = new FormData();
                formData.append('profilePicture', profilePictureFile);
                const response = await api.post('/upload/profile-picture', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                setUploadingPic(false);
                setProfile((current) => ({ ...current, profile_picture_url: response.data.url }));
            }

            setProfile((current) => ({ ...current, contact_number: contactNumber }));
            setProfilePictureFile(null);
            setAppointmentNotice({ type: 'success', text: 'Profile updated successfully.' });
            setShowSettings(false);
        } catch (error) {
            console.error("Failed to update profile:", error);
            setUploadingPic(false);
            setAppointmentNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update profile.' });
        }
    };

    const handlePasswordChange = async (event) => {
        event.preventDefault();
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setAppointmentNotice({ type: 'error', text: 'New passwords do not match.' });
            return;
        }
        setPasswordSaving(true);
        try {
            await api.put('/auth/change-password', {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
            });
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setShowPasswordForm(false);
            setAppointmentNotice({ type: 'success', text: 'Password changed successfully.' });
        } catch (error) {
            setAppointmentNotice({ type: 'error', text: error.response?.data?.message || 'Unable to change password.' });
        } finally {
            setPasswordSaving(false);
        }
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const handleMarkAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(notifications.map(n => n.notification_id === id ? {...n, is_read: true} : n));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-6 md:gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 border-b border-slate-200 gap-4 relative">
                <div className="flex items-center gap-6 p-6">
                    <div className="relative h-20 w-20 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm border border-blue-200 overflow-hidden">
                        {profile?.profile_picture_url ? (
                            <img src={profile.profile_picture_url} alt="Profile" className="object-cover h-full w-full" />
                        ) : (
                            <IconUser size={40} stroke={1.5} />
                        )}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                            Welcome back, {profile?.first_name || 'Student'}! 👋
                        </h1>
                        <p className="text-slate-500 mt-1 flex items-center gap-2">
                            <span className="bg-slate-100 px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200">
                                ID: {profile?.student_number}
                            </span>
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100 w-full sm:w-auto justify-center sm:justify-start">
                    <IconUser size={20} className="text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700">
                        {user?.role === 'staff' ? 'Staff Portal' : 'Student Portal'}
                    </span>
                    
                    <div className="relative">
                        <button 
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors relative"
                            title="Notifications"
                        >
                            <IconBell size={20} />
                            {unreadCount > 0 && (
                                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
                            )}
                        </button>
                        
                        {/* Notifications Dropdown */}
                        {showNotifications && (
                            <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
                                <div className="p-4 border-b border-slate-100">
                                    <h3 className="font-semibold text-slate-800">Notifications</h3>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="p-6 text-center text-slate-500 text-sm">No notifications</div>
                                    ) : (
                                        notifications.map(n => (
                                            <div 
                                                key={n.notification_id} 
                                                onClick={() => !n.is_read && handleMarkAsRead(n.notification_id)}
                                                className={`p-4 border-b border-slate-50 cursor-pointer transition-colors ${n.is_read ? 'opacity-60' : 'bg-blue-50/50 hover:bg-blue-50'}`}
                                            >
                                                <p className="text-sm text-slate-700">{n.message}</p>
                                                <p className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => setShowSettings(true)}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                        title="Settings"
                    >
                        <IconSettings size={20} />
                    </button>
                    <button 
                        onClick={logout}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Log out"
                    >
                        <IconLogout size={20} />
                    </button>
                </div>
            </header>

            {appointmentNotice && (
                <div role={appointmentNotice.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${appointmentNotice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {appointmentNotice.text}
                </div>
            )}

            <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column - Booking Section */}
                <section className="lg:col-span-2 flex flex-col gap-6">
                    <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                        <h2 className="text-lg md:text-xl font-semibold mb-6 flex items-center gap-2">
                            <IconCalendarEvent className="text-blue-500" />
                            Book an Appointment
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {slotsLoading ? (
                                <p className="text-slate-500" role="status">Loading available times...</p>
                            ) : slotsError ? (
                                <p className="text-red-600" role="alert">{slotsError}</p>
                            ) : !Array.isArray(slots) || slots.length === 0 ? (
                                <p className="text-slate-500">No available slots at the moment.</p>
                            ) : slots.map((slot) => (
                                <button 
                                    key={slot.slot_id} 
                                    onClick={() => handleBookSlot(slot.slot_id)}
                                    className="p-4 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group bg-slate-50 hover:bg-white flex justify-between items-center text-left w-full"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-800 mb-1">{new Date(slot.slot_date).toLocaleDateString()}</p>
                                        <div className="flex items-center gap-2 text-sm text-slate-500 group-hover:text-blue-600 transition-colors">
                                            <IconClock size={16} />
                                            <span>{slot.start_time} - {slot.end_time}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                                            {slot.staff_first_name} {slot.staff_last_name}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between gap-3 mb-5">
                            <h2 className="text-lg md:text-xl font-semibold flex items-center gap-2">
                                <IconClock className="text-blue-500" />
                                My Appointments
                            </h2>
                            <span className="text-xs font-medium text-slate-500">{appointments.length} total</span>
                        </div>
                        {appointmentsError ? (
                            <p role="alert" className="text-sm text-red-600">{appointmentsError}</p>
                        ) : appointments.length === 0 ? (
                            <p className="text-slate-500 text-sm">Your appointment history will appear here after you book.</p>
                        ) : (
                            <div className="flex flex-col divide-y divide-slate-100">
                                {appointments.map((appointment) => (
                                    <div key={appointment.appointment_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                                        <div>
                                            <p className="font-semibold text-slate-800">
                                                {new Date(appointment.slot_date).toLocaleDateString()} · {appointment.start_time}
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                {appointment.staff_first_name} {appointment.staff_last_name}
                                                {appointment.specialization ? ` · ${appointment.specialization}` : ''}
                                            </p>
                                            <p className="text-sm text-slate-600 mt-1">{appointment.reason}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                                                appointment.status === 'confirmed' ? 'bg-green-50 text-green-700' :
                                                appointment.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                                                ['cancelled', 'rejected'].includes(appointment.status) ? 'bg-red-50 text-red-700' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>{appointment.status}</span>
                                            {['pending', 'confirmed'].includes(appointment.status) && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRescheduleAppointment(appointment);
                                                            setRescheduleSlotId('');
                                                            setRescheduleReason('');
                                                        }}
                                                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                                                    >
                                                        Reschedule
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCancelAppointment(appointment.appointment_id)}
                                                        className="text-sm font-medium text-red-600 hover:text-red-700"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {rescheduleRequests.length > 0 && (
                        <div className="mt-6 border-t border-slate-100 pt-5">
                            <h3 className="mb-3 text-sm font-semibold text-slate-800">Reschedule requests</h3>
                            <div className="flex flex-col gap-2">
                                {rescheduleRequests.map((request) => (
                                    <div key={request.request_id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">
                                                {new Date(`${request.requested_date}T00:00:00`).toLocaleDateString()} · {request.requested_start_time}
                                            </p>
                                            {request.reason && <p className="mt-1 text-xs text-slate-500">{request.reason}</p>}
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : request.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                                            {request.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                {/* Right Column - Status/Info Section */}
                <aside className="w-full lg:w-80 flex flex-col gap-6">
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex-1 min-h-[300px]">
                        <IconStethoscope size={120} className="absolute -bottom-6 -right-6 text-blue-500 opacity-20 rotate-12" />
                        <h2 className="text-xl font-semibold mb-4 relative z-10">Medical History</h2>
                        
                        <div className="relative z-10 flex flex-col gap-4 mt-6">
                            {!Array.isArray(records) || records.length === 0 ? (
                                <div className="text-blue-100 text-sm">
                                    <p className="mb-2">No medical records found.</p>
                                    <p>Your appointment history and doctor's notes will appear here.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                                    {records.map(record => (
                                        <div key={record.record_id} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                                            <p className="text-xs text-blue-200 font-medium mb-1">
                                                {new Date(record.slot_date).toLocaleDateString()} • Dr. {record.staff_last_name}
                                            </p>
                                            <h3 className="font-semibold text-lg mb-2">{record.diagnosis}</h3>
                                            
                                            {record.prescription && (
                                                <div className="mb-2">
                                                    <p className="text-xs text-blue-200 uppercase tracking-wider font-semibold mb-0.5">Prescription</p>
                                                    <p className="text-sm bg-white/10 rounded-lg px-2 py-1 inline-block">{record.prescription}</p>
                                                </div>
                                            )}
                                            
                                            {record.notes && (
                                                <div>
                                                    <p className="text-xs text-blue-200 uppercase tracking-wider font-semibold mb-0.5">Notes</p>
                                                    <p className="text-sm text-blue-50 leading-relaxed">{record.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </aside>
                
            </main>

            {bookingSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
                    <form onSubmit={submitBooking} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-slate-800">Confirm appointment</h2>
                        <p className="mt-2 text-sm text-slate-500">Explain briefly why you need to visit the clinic.</p>
                        <label className="mt-5 block text-sm font-medium text-slate-700">
                            Reason for visit
                            <textarea
                                required
                                maxLength={2000}
                                value={bookingReason}
                                onChange={(event) => setBookingReason(event.target.value)}
                                className="mt-2 h-28 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                placeholder="Describe your concern"
                            />
                        </label>
                        <div className="mt-5 flex justify-end gap-3">
                            <button type="button" onClick={() => setBookingSlot(null)} className="rounded-xl px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
                            <button type="submit" disabled={bookingLoading} className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                {bookingLoading ? 'Booking…' : 'Book appointment'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {rescheduleAppointment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
                    <form
                        onSubmit={async (event) => {
                            event.preventDefault();
                            if (!rescheduleSlotId) return;
                            setRescheduleLoading(true);
                            try {
                                await api.post(`/appointments/${rescheduleAppointment.appointment_id}/reschedule-request`, {
                                    slotId: Number(rescheduleSlotId),
                                    reason: rescheduleReason,
                                });
                                setAppointmentNotice({ type: 'success', text: 'Reschedule request submitted for approval.' });
                                setRescheduleAppointment(null);
                            } catch (error) {
                                setAppointmentNotice({ type: 'error', text: error.response?.data?.message || 'Unable to submit reschedule request.' });
                            } finally {
                                setRescheduleLoading(false);
                            }
                        }}
                        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
                    >
                        <h2 className="text-xl font-bold text-slate-800">Request rescheduling</h2>
                        <label className="mt-5 block text-sm font-medium text-slate-700">
                            Available schedule
                            <select
                                required
                                value={rescheduleSlotId}
                                onChange={(event) => setRescheduleSlotId(event.target.value)}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                            >
                                <option value="">Select a date and time</option>
                                {slots
                                    .filter((slot) => slot.slot_id !== rescheduleAppointment.slot_id)
                                    .map((slot) => (
                                        <option key={slot.slot_id} value={slot.slot_id}>
                                            {new Date(`${slot.slot_date}T00:00:00`).toLocaleDateString()} · {slot.start_time}–{slot.end_time}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        <label className="mt-4 block text-sm font-medium text-slate-700">
                            Reason (optional)
                            <textarea
                                maxLength={1000}
                                value={rescheduleReason}
                                onChange={(event) => setRescheduleReason(event.target.value)}
                                className="mt-2 h-20 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                            />
                        </label>
                        <div className="mt-5 flex justify-end gap-3">
                            <button type="button" onClick={() => setRescheduleAppointment(null)} className="rounded-xl px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
                            <button type="submit" disabled={rescheduleLoading || !rescheduleSlotId} className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                {rescheduleLoading ? 'Submitting…' : 'Submit request'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Settings Modal - Enhanced Profile View */}
            {showSettings && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] p-6 md:p-8 w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 transform transition-all">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold tracking-tight text-slate-800">My Profile</h2>
                            <button onClick={() => setShowSettings(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                <IconX size={20} />
                            </button>
                        </div>
                        
                        {profile ? (
                            <div className="space-y-6">
                                <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50 flex flex-col gap-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-slate-500">Full Name</span>
                                        <span className="text-sm font-bold text-slate-800">{profile.first_name} {profile.last_name}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-slate-500">Student ID</span>
                                        <span className="text-sm font-bold text-slate-800">{profile.student_number}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-slate-500">Email Address</span>
                                        <span className="text-sm font-bold text-slate-800">{profile.email}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-slate-500">Date of Birth</span>
                                        <span className="text-sm font-bold text-slate-800">{new Date(profile.dob).toLocaleDateString()}</span>
                                    </div>
                                </div>

                              <form onSubmit={handleUpdateProfile} className="flex flex-col gap-5 p-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number</label>
                                    <input 
                                        type="tel" 
                                        required
                                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        value={contactNumber}
                                        onChange={(e) => setContactNumber(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Profile Picture (AWS S3 Upload)</label>
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                                        onChange={(e) => setProfilePictureFile(e.target.files[0])}
                                    />
                                </div>
                                <button type="button" onClick={() => setShowPasswordForm(true)} className="text-left text-sm font-semibold text-blue-700 hover:text-blue-900">
                                    Change password
                                </button>
                                <div className="flex gap-3 mt-2">
                                    <button type="button" onClick={() => setShowSettings(false)} className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-xl transition-colors">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={uploadingPic} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
                                        {uploadingPic ? 'Uploading...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form></div>
                        ) : (
                            <div className="py-8 flex justify-center">
                                <p className="text-slate-500 text-sm font-medium animate-pulse">Loading profile data...</p>
                            </div>
                        )}
                        {showPasswordForm && (
                            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
                                <form onSubmit={handlePasswordChange} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                                    <h2 className="text-xl font-bold text-slate-900">Change password</h2>
                                    <p className="mt-2 text-sm text-slate-500">Use 10–128 characters with uppercase, lowercase, and a number.</p>
                                    <div className="mt-5 space-y-4">
                                        <label className="block text-sm font-medium text-slate-700">
                                            Current password
                                            <input required type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
                                        </label>
                                        <label className="block text-sm font-medium text-slate-700">
                                            New password
                                            <input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
                                        </label>
                                        <label className="block text-sm font-medium text-slate-700">
                                            Confirm new password
                                            <input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
                                        </label>
                                    </div>
                                    <div className="mt-6 flex justify-end gap-3">
                                        <button type="button" onClick={() => setShowPasswordForm(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                                        <button type="submit" disabled={passwordSaving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                            {passwordSaving ? 'Changing…' : 'Change password'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
