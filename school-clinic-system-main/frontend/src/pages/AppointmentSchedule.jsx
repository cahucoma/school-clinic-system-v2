import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    IconCalendarEvent,
    IconCalendarPlus,
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconClock,
    IconEye,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import api from '../utils/api';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUSES = ['pending', 'confirmed', 'rejected', 'completed', 'cancelled'];

function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function monthRange(date) {
    return {
        from: dateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
        to: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
    };
}

function formatDate(value, options = { dateStyle: 'medium' }) {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return '—';
    return new Date(year, month - 1, day).toLocaleDateString(undefined, options);
}

function isBooked(slot) {
    return slot.is_booked === true || Number(slot.is_booked) === 1;
}

function statusStyles(status) {
    const styles = {
        pending: 'bg-amber-50 text-amber-700',
        confirmed: 'bg-emerald-50 text-emerald-700',
        rejected: 'bg-rose-50 text-rose-700',
        cancelled: 'bg-slate-100 text-slate-600',
        completed: 'bg-blue-50 text-blue-700',
        available: 'bg-teal-50 text-teal-700',
        unavailable: 'bg-slate-100 text-slate-600',
    };
    return styles[status] || styles.unavailable;
}

function StatusBadge({ status }) {
    return (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles(status)}`}>
            {status}
        </span>
    );
}

function Modal({ title, onClose, children, wide = false }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`my-auto max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <IconX size={20} />
                    </button>
                </div>
                {children}
            </section>
        </div>
    );
}

export default function AppointmentSchedule() {
    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
    const [schedules, setSchedules] = useState([]);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [scheduleError, setScheduleError] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [appointmentLoading, setAppointmentLoading] = useState(true);
    const [appointmentError, setAppointmentError] = useState('');
    const [filters, setFilters] = useState({ search: '', status: 'all', from: '', to: '' });
    const [notice, setNotice] = useState(null);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyError, setHistoryError] = useState('');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [savingId, setSavingId] = useState(null);
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [staff, setStaff] = useState([]);
    const [staffError, setStaffError] = useState('');
    const [scheduleSaving, setScheduleSaving] = useState(false);
    const [scheduleForm, setScheduleForm] = useState({ staffId: '', slotDate: '', startTime: '', endTime: '' });
    const [rescheduleAppointment, setRescheduleAppointment] = useState(null);
    const [availableSlots, setAvailableSlots] = useState([]);
    const [rescheduleSlotId, setRescheduleSlotId] = useState('');
    const [rescheduleLoading, setRescheduleLoading] = useState(false);
    const [rescheduleSaving, setRescheduleSaving] = useState(false);

    const range = useMemo(() => monthRange(month), [month]);
    const calendarCells = useMemo(() => {
        const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
        const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        return [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
    }, [month]);

    const loadSchedules = useCallback(async (dateRange = range) => {
        setScheduleLoading(true);
        try {
            const response = await api.get('/admin/schedules', { params: dateRange });
            setSchedules(response.data);
            setScheduleError('');
        } catch (error) {
            console.error('Failed to fetch clinic schedules:', error);
            setScheduleError(error.response?.data?.message || 'Unable to load clinic schedules.');
        } finally {
            setScheduleLoading(false);
        }
    }, [range]);

    const loadAppointments = useCallback(async (activeFilters = filters) => {
        setAppointmentLoading(true);
        const params = {};
        if (activeFilters.search.trim()) params.search = activeFilters.search.trim();
        if (activeFilters.status !== 'all') params.status = activeFilters.status;
        if (activeFilters.from) params.from = activeFilters.from;
        if (activeFilters.to) params.to = activeFilters.to;
        try {
            const response = await api.get('/admin/appointments', { params });
            setAppointments(response.data);
            setAppointmentError('');
        } catch (error) {
            console.error('Failed to fetch appointments:', error);
            setAppointmentError(error.response?.data?.message || 'Unable to load appointments.');
        } finally {
            setAppointmentLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadSchedules();
    }, [loadSchedules]);

    useEffect(() => {
        const timer = window.setTimeout(() => loadAppointments(), 250);
        return () => window.clearTimeout(timer);
    }, [loadAppointments]);

    useEffect(() => {
        api.get('/admin/staff')
            .then((response) => {
                setStaff(response.data);
                setStaffError('');
            })
            .catch((error) => {
                console.error('Failed to fetch clinic staff:', error);
                setStaffError(error.response?.data?.message || 'Unable to load clinic staff.');
            });
    }, []);

    useEffect(() => {
        if (!notice) return undefined;
        const timer = window.setTimeout(() => setNotice(null), 4500);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const selectedDaySlots = useMemo(
        () => schedules.filter((slot) => slot.slot_date === selectedDate),
        [schedules, selectedDate]
    );
    const schedulesByDate = useMemo(() => {
        const grouped = new Map();
        schedules.forEach((slot) => {
            const current = grouped.get(slot.slot_date) || { booked: 0, available: 0 };
            if (isBooked(slot)) current.booked += 1;
            else current.available += 1;
            grouped.set(slot.slot_date, current);
        });
        return grouped;
    }, [schedules]);

    const changeMonth = (amount) => {
        const nextMonth = new Date(month.getFullYear(), month.getMonth() + amount, 1);
        setMonth(nextMonth);
        setSelectedDate(dateKey(nextMonth));
    };

    const openAppointment = async (appointment) => {
        setSelectedAppointment(appointment);
        setHistory([]);
        setHistoryError('');
        setHistoryLoading(true);
        try {
            const response = await api.get(`/admin/appointments/${appointment.appointment_id}/history`);
            setHistory(response.data);
        } catch (error) {
            console.error('Failed to fetch appointment history:', error);
            setHistoryError(error.response?.data?.message || 'Unable to load appointment history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleStatus = async (appointment, status) => {
        const prompts = {
            rejected: 'Reject this appointment request?',
            cancelled: 'Cancel this appointment? The student will be notified.',
            completed: 'Mark this appointment as completed?',
        };
        if (prompts[status] && !window.confirm(prompts[status])) return;

        setSavingId(appointment.appointment_id);
        try {
            const response = await api.put(`/admin/appointments/${appointment.appointment_id}/status`, { status });
            setNotice({ type: 'success', text: response.data.message || 'Appointment updated.' });
            setSelectedAppointment(null);
            await Promise.all([loadAppointments(filters), loadSchedules()]);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update appointment.' });
        } finally {
            setSavingId(null);
        }
    };

    const openScheduleForm = () => {
        const today = dateKey(new Date());
        const defaultDate = selectedDate >= today ? selectedDate : today;
        setScheduleForm({ staffId: '', slotDate: defaultDate, startTime: '', endTime: '' });
        setShowScheduleForm(true);
    };

    const handleCreateSchedule = async (event) => {
        event.preventDefault();
        setScheduleSaving(true);
        try {
            const response = await api.post('/admin/schedules', {
                ...scheduleForm,
                staffId: Number(scheduleForm.staffId),
            });
            setNotice({ type: 'success', text: response.data.message || 'Schedule created.' });
            setShowScheduleForm(false);
            await loadSchedules();
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to create schedule.' });
        } finally {
            setScheduleSaving(false);
        }
    };

    const openReschedule = async (appointment) => {
        setRescheduleAppointment(appointment);
        setAvailableSlots([]);
        setRescheduleSlotId('');
        setRescheduleLoading(true);
        const today = new Date();
        const through = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 180);
        try {
            const response = await api.get('/admin/schedules', {
                params: { from: dateKey(today), to: dateKey(through) },
            });
            const options = response.data.filter((slot) => !isBooked(slot) && slot.slot_id !== appointment.slot_id);
            setAvailableSlots(options);
            setRescheduleSlotId(String(options[0]?.slot_id || ''));
        } catch (error) {
            console.error('Failed to fetch reschedule options:', error);
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to load available schedules.' });
        } finally {
            setRescheduleLoading(false);
        }
    };

    const handleReschedule = async (event) => {
        event.preventDefault();
        if (!rescheduleAppointment || !rescheduleSlotId) return;
        setRescheduleSaving(true);
        try {
            const response = await api.put(`/admin/appointments/${rescheduleAppointment.appointment_id}/reschedule`, {
                slotId: Number(rescheduleSlotId),
            });
            setNotice({ type: 'success', text: response.data.message || 'Appointment rescheduled.' });
            setRescheduleAppointment(null);
            setSelectedAppointment(null);
            await Promise.all([loadAppointments(filters), loadSchedules()]);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to reschedule appointment.' });
        } finally {
            setRescheduleSaving(false);
        }
    };

    const dayLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    return (
        <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Clinic operations</p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Appointment Schedule</h1>
                    <p className="mt-2 text-sm text-slate-500">Review availability, manage bookings, and update appointment status.</p>
                </div>
                <button type="button" onClick={openScheduleForm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
                    <IconPlus size={18} />
                    Add schedule
                </button>
            </header>

            {notice && (
                <div role={notice.type === 'error' ? 'alert' : 'status'} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                    notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}>
                    <span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification" className="rounded-md p-1 hover:bg-black/5"><IconX size={16} /></button>
                </div>
            )}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Clinic calendar</h2>
                            <p className="mt-1 text-sm text-slate-500">Select a date to view its schedules.</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><IconChevronLeft size={20} /></button>
                            <span className="min-w-36 text-center text-sm font-semibold text-slate-800">
                                {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><IconChevronRight size={20} /></button>
                            <button
                                type="button"
                                onClick={() => {
                                    const today = new Date();
                                    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                                    setSelectedDate(dateKey(today));
                                }}
                                className="ml-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Today
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {WEEKDAYS.map((day) => <div key={day} className="py-2">{day}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1 pt-2 sm:gap-2">
                        {calendarCells.map((day, index) => {
                            if (!day) return <div key={`empty-${index}`} aria-hidden="true" className="min-h-16 rounded-xl sm:min-h-20" />;
                            const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
                            const counts = schedulesByDate.get(key);
                            const isSelected = selectedDate === key;
                            const isToday = dateKey(new Date()) === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    aria-pressed={isSelected}
                                    aria-label={`${formatDate(key, { dateStyle: 'full' })}${counts ? `, ${counts.booked} unavailable and ${counts.available} available` : ''}`}
                                    onClick={() => setSelectedDate(key)}
                                    className={`min-h-16 rounded-xl border p-1 text-left transition sm:min-h-20 sm:p-2 ${
                                        isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                                        isToday ? 'bg-blue-600 text-white' : isSelected ? 'text-blue-800' : 'text-slate-700'
                                    }`}>{day}</span>
                                    {counts && (
                                        <span className="mt-1 block truncate text-[10px] leading-4 text-slate-500 sm:text-xs">
                                            {counts.booked > 0 && <span className="text-blue-700">{counts.booked} booked</span>}
                                            {counts.booked > 0 && counts.available > 0 ? ' · ' : ''}
                                            {counts.available > 0 && <span className="text-teal-700">{counts.available} open</span>}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Booked schedules</span>
                        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-teal-500" /> Available schedules</span>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Daily availability</h2>
                            <p className="mt-1 text-sm text-slate-500">{dayLabel}</p>
                        </div>
                        <IconCalendarEvent className="text-blue-600" size={22} />
                    </div>
                    {scheduleLoading ? (
                        <p role="status" className="py-8 text-center text-sm text-slate-500">Loading schedules…</p>
                    ) : scheduleError ? (
                        <div className="py-6 text-center">
                            <p role="alert" className="text-sm text-rose-700">{scheduleError}</p>
                            <button type="button" onClick={() => loadSchedules()} className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-800">Try again</button>
                        </div>
                    ) : selectedDaySlots.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                            <p className="text-sm font-medium text-slate-700">No schedules for this date</p>
                            <p className="mt-1 text-xs text-slate-500">Add a clinic schedule to make this date available.</p>
                        </div>
                    ) : (
                        <div className="max-h-[390px] space-y-3 overflow-y-auto pr-1">
                            {selectedDaySlots.map((slot) => {
                                const booked = isBooked(slot);
                                const appointment = slot.appointment_id ? {
                                    ...slot,
                                    appointment_id: slot.appointment_id,
                                    slot_id: slot.slot_id,
                                    student_number: slot.student_number,
                                } : null;
                                return (
                                    <article key={slot.slot_id} className="rounded-xl border border-slate-200 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><IconClock size={16} className="text-slate-400" />{slot.start_time}–{slot.end_time}</p>
                                                <p className="mt-1 text-xs text-slate-500">{slot.staff_first_name} {slot.staff_last_name}</p>
                                                {booked && <p className="mt-2 text-sm text-slate-700">{slot.student_first_name ? `${slot.student_first_name} ${slot.student_last_name}` : 'Reserved clinic time'}</p>}
                                            </div>
                                            <StatusBadge status={booked ? (slot.status || 'unavailable') : 'available'} />
                                        </div>
                                        {appointment && (
                                            <button type="button" onClick={() => openAppointment(appointment)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900">
                                                <IconEye size={15} /> View appointment
                                            </button>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Appointment management</h2>
                        <p className="mt-1 text-sm text-slate-500">{appointmentLoading ? 'Updating results…' : `${appointments.length} matching appointments`}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="relative sm:col-span-2 lg:col-span-1">
                            <span className="sr-only">Search student name or number</span>
                            <IconSearch size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={filters.search}
                                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                                placeholder="Student name or number"
                                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>
                        <label>
                            <span className="sr-only">Filter by status</span>
                            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                                <option value="all">All statuses</option>
                                {STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                            </select>
                        </label>
                        <label>
                            <span className="sr-only">From date</span>
                            <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label>
                            <span className="sr-only">To date</span>
                            <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                    </div>
                </div>

                {appointmentError ? (
                    <div className="py-8 text-center">
                        <p role="alert" className="text-sm text-rose-700">{appointmentError}</p>
                        <button type="button" onClick={() => loadAppointments(filters)} className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-800">Try again</button>
                    </div>
                ) : appointmentLoading && appointments.length === 0 ? (
                    <p role="status" className="py-8 text-center text-sm text-slate-500">Loading appointments…</p>
                ) : appointments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">No appointments match these filters.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-left">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    <th className="px-3 py-3">Student</th>
                                    <th className="px-3 py-3">Appointment</th>
                                    <th className="px-3 py-3">Provider</th>
                                    <th className="px-3 py-3">Status</th>
                                    <th className="px-3 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map((appointment) => (
                                    <tr key={appointment.appointment_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                                        <td className="px-3 py-4">
                                            <p className="text-sm font-semibold text-slate-800">{appointment.student_first_name} {appointment.student_last_name}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">{appointment.student_number}</p>
                                        </td>
                                        <td className="px-3 py-4 text-sm text-slate-600">
                                            <p>{formatDate(appointment.slot_date)}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">{appointment.start_time}–{appointment.end_time}</p>
                                        </td>
                                        <td className="px-3 py-4 text-sm text-slate-600">{appointment.staff_first_name} {appointment.staff_last_name}</td>
                                        <td className="px-3 py-4"><StatusBadge status={appointment.status} /></td>
                                        <td className="px-3 py-4">
                                            <div className="flex justify-end gap-2">
                                                <button type="button" onClick={() => openAppointment(appointment)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                                    <IconEye size={15} /> View
                                                </button>
                                                {appointment.status === 'pending' && (
                                                    <button type="button" disabled={savingId === appointment.appointment_id} onClick={() => handleStatus(appointment, 'confirmed')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                                                        <IconCheck size={15} /> Approve
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {selectedAppointment && (
                <Modal title="Appointment details" onClose={() => setSelectedAppointment(null)} wide>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Student</p>
                            <p className="mt-1 font-semibold text-slate-800">{selectedAppointment.student_first_name} {selectedAppointment.student_last_name}</p>
                            <p className="text-sm text-slate-500">{selectedAppointment.student_number || 'Student number unavailable'}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Appointment status</p>
                            <div className="mt-2"><StatusBadge status={selectedAppointment.status} /></div>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Schedule</p>
                            <p className="mt-1 font-semibold text-slate-800">{formatDate(selectedAppointment.slot_date)}</p>
                            <p className="text-sm text-slate-500">{selectedAppointment.start_time}–{selectedAppointment.end_time}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Clinic provider</p>
                            <p className="mt-1 font-semibold text-slate-800">{selectedAppointment.staff_first_name} {selectedAppointment.staff_last_name}</p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reason for visit</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedAppointment.reason || 'No reason provided.'}</p>
                    </div>

                    <div className="mt-6 border-t border-slate-100 pt-5">
                        <h3 className="font-semibold text-slate-800">Appointment history</h3>
                        {historyLoading ? <p role="status" className="mt-2 text-sm text-slate-500">Loading history…</p>
                            : historyError ? <p role="alert" className="mt-2 text-sm text-rose-700">{historyError}</p>
                                : history.length === 0 ? <p className="mt-2 text-sm text-slate-500">No admin changes recorded.</p>
                                    : (
                                        <ol className="mt-3 space-y-3">
                                            {history.map((item) => (
                                                <li key={item.history_id} className="flex gap-3 text-sm">
                                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                                                    <div>
                                                        <p className="font-medium text-slate-700">
                                                            {item.action === 'rescheduled' ? 'Rescheduled' : `Status changed: ${item.previous_status} → ${item.new_status}`}
                                                        </p>
                                                        {item.action === 'rescheduled' && (
                                                            <p className="text-slate-500">
                                                                {formatDate(item.previous_date)} {item.previous_start_time}–{item.previous_end_time}
                                                                {' → '}
                                                                {formatDate(item.new_date)} {item.new_start_time}–{item.new_end_time}
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</p>
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                    </div>

                    <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
                        {selectedAppointment.status === 'pending' && (
                            <>
                                <button type="button" disabled={savingId === selectedAppointment.appointment_id} onClick={() => handleStatus(selectedAppointment, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button>
                                <button type="button" disabled={savingId === selectedAppointment.appointment_id} onClick={() => handleStatus(selectedAppointment, 'confirmed')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                            </>
                        )}
                        {selectedAppointment.status === 'confirmed' && (
                            <>
                                <button type="button" disabled={savingId === selectedAppointment.appointment_id} onClick={() => openReschedule(selectedAppointment)} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Reschedule</button>
                                <button type="button" disabled={savingId === selectedAppointment.appointment_id} onClick={() => handleStatus(selectedAppointment, 'cancelled')} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Cancel</button>
                                <button type="button" disabled={savingId === selectedAppointment.appointment_id} onClick={() => handleStatus(selectedAppointment, 'completed')} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Mark completed</button>
                            </>
                        )}
                    </div>
                </Modal>
            )}

            {showScheduleForm && (
                <Modal title="Add clinic schedule" onClose={() => setShowScheduleForm(false)}>
                    <form onSubmit={handleCreateSchedule} className="space-y-4">
                        {staffError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{staffError}</p>}
                        <label className="block text-sm font-medium text-slate-700">
                            Clinic provider
                            <select required value={scheduleForm.staffId} onChange={(event) => setScheduleForm({ ...scheduleForm, staffId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                                <option value="">Select a staff member</option>
                                {staff.map((member) => <option key={member.staff_id} value={member.staff_id}>{member.first_name} {member.last_name}{member.specialization ? ` · ${member.specialization}` : ''}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Date
                            <input required type="date" min={dateKey(new Date())} value={scheduleForm.slotDate} onChange={(event) => setScheduleForm({ ...scheduleForm, slotDate: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-sm font-medium text-slate-700">
                                Start time
                                <input required type="time" value={scheduleForm.startTime} onChange={(event) => setScheduleForm({ ...scheduleForm, startTime: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                            </label>
                            <label className="block text-sm font-medium text-slate-700">
                                End time
                                <input required type="time" value={scheduleForm.endTime} onChange={(event) => setScheduleForm({ ...scheduleForm, endTime: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                            </label>
                        </div>
                        {staff.length === 0 && !staffError && <p role="status" className="text-xs text-slate-500">No clinic staff are available to schedule.</p>}
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setShowScheduleForm(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                            <button type="submit" disabled={scheduleSaving || staff.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                                <IconCalendarPlus size={17} />{scheduleSaving ? 'Saving…' : 'Save schedule'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {rescheduleAppointment && (
                <Modal title="Reschedule appointment" onClose={() => setRescheduleAppointment(null)}>
                    <form onSubmit={handleReschedule} className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Select an open clinic time for {rescheduleAppointment.student_first_name} {rescheduleAppointment.student_last_name}.
                        </p>
                        {rescheduleLoading ? (
                            <p role="status" className="py-5 text-center text-sm text-slate-500">Loading available schedules…</p>
                        ) : availableSlots.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
                                <p className="text-sm text-slate-600">No open schedules are available in the next 180 days.</p>
                                <button type="button" onClick={() => { setRescheduleAppointment(null); openScheduleForm(); }} className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-900">Add a schedule</button>
                            </div>
                        ) : (
                            <label className="block text-sm font-medium text-slate-700">
                                Available schedule
                                <select required value={rescheduleSlotId} onChange={(event) => setRescheduleSlotId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                                    {availableSlots.map((slot) => (
                                        <option key={slot.slot_id} value={slot.slot_id}>
                                            {formatDate(slot.slot_date)} · {slot.start_time}–{slot.end_time} · {slot.staff_first_name} {slot.staff_last_name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setRescheduleAppointment(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>
                            {availableSlots.length > 0 && !rescheduleLoading && (
                                <button type="submit" disabled={rescheduleSaving || !rescheduleSlotId} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                                    {rescheduleSaving ? 'Saving…' : 'Save new time'}
                                </button>
                            )}
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
