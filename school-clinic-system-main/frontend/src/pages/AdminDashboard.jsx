import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth';
import api from '../utils/api';
import { 
    IconUsers, 
    IconStethoscope, 
    IconCalendarEvent, 
    IconActivity
} from '@tabler/icons-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const AdminDashboard = () => {
    const { logout } = useAuth();
    const [stats, setStats] = useState(null);
    const [statsError, setStatsError] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [appointmentError, setAppointmentError] = useState('');
    const [loading, setLoading] = useState(true);
    const [showAddStaff, setShowAddStaff] = useState(false);
    
    // Add Staff Form State
    const [newStaff, setNewStaff] = useState({
        firstName: '', lastName: '', email: '', password: '', specialization: '', roomNumber: ''
    });

    const loadStats = async () => {
        setLoading(true);
        try {
            const response = await api.get('/admin/stats');
            setStats(response.data);
            setStatsError('');
        } catch (error) {
            console.error('Failed to fetch admin stats:', error);
            setStatsError(error.response?.data?.message || 'Unable to load dashboard statistics.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, []);

    const fetchAppointments = async () => {
        try {
            const response = await api.get('/admin/appointments');
            setAppointments(response.data);
            setAppointmentError('');
        } catch (error) {
            console.error('Failed to fetch admin appointments:', error);
            setAppointmentError(error.response?.data?.message || 'Unable to load appointments.');
        }
    };

    useEffect(() => {
        fetchAppointments();
    }, []);

    const handleAppointmentStatus = async (appointmentId, status) => {
        try {
            await api.put(`/admin/appointments/${appointmentId}/status`, { status });
            await fetchAppointments();
            await loadStats();
        } catch (error) {
            alert(error.response?.data?.message || 'Unable to update appointment.');
        }
    };

    const handleAddStaff = async (e) => {
        e.preventDefault();
        try {
            await api.post('/admin/staff', newStaff);
            alert("Staff member successfully added!");
            setShowAddStaff(false);
            setNewStaff({ firstName: '', lastName: '', email: '', password: '', specialization: '', roomNumber: '' });
            
            await loadStats();
        } catch (error) {
            alert(error.response?.data?.message || "Failed to add staff member");
        }
    };

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500" role="status">Loading dashboard...</div>;
    if (statsError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
                <p role="alert" className="text-red-600">{statsError}</p>
                <button type="button" onClick={loadStats} className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700">
                    Try again
                </button>
                <button type="button" onClick={logout} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                    Sign out
                </button>
            </div>
        );
    }

    const chartData = [
        { name: 'Completed', value: stats?.appointments?.completed || 0 },
        { name: 'Pending', value: stats?.appointments?.pending || 0 },
        { name: 'Confirmed', value: stats?.appointments?.confirmed || 0 },
        { name: 'Rejected', value: stats?.appointments?.rejected || 0 },
        { name: 'Cancelled', value: stats?.appointments?.cancelled || 0 },
    ].filter(item => item.value > 0);

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 border-b border-slate-200 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Overview</h1>
                    <p className="text-slate-500 mt-1">System Health and Analytics</p>
                </div>
                <span className="text-sm font-semibold text-slate-500">Administrator</span>
            </header>

            <div className="flex justify-end">
                <button 
                    onClick={() => setShowAddStaff(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-xl shadow-sm transition-colors"
                >
                    + Add New Staff
                </button>
            </div>

            <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* Metrics Row */}
                <section className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <IconUsers size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Total Students</p>
                            <p className="text-2xl font-bold text-slate-800">{stats?.students || 0}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <IconStethoscope size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Active Staff</p>
                            <p className="text-2xl font-bold text-slate-800">{stats?.staff || 0}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                            <IconCalendarEvent size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Total Appointments</p>
                            <p className="text-2xl font-bold text-slate-800">{stats?.appointments?.total || 0}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                            <IconActivity size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">System Status</p>
                            <p className="text-xl font-bold text-slate-800">Connected</p>
                        </div>
                    </div>
                </section>

                {/* Chart Section */}
                <section className="lg:col-span-1 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col">
                    <h2 className="text-lg font-semibold text-slate-800 mb-6">Appointments by Status</h2>
                    <div className="flex-1 min-h-[300px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{
                                            borderRadius: '12px',
                                            border: '1px solid var(--surface-border)',
                                            backgroundColor: 'var(--surface-card)',
                                            color: 'var(--text-primary)',
                                            boxShadow: 'var(--surface-shadow)',
                                        }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                        labelStyle={{ color: 'var(--text-secondary)' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: 'var(--text-secondary)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400">
                                No data available
                            </div>
                        )}
                    </div>
                </section>

                {/* Recent Activity Table */}
                <section className="lg:col-span-2 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-800 mb-6">Recent Activity</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className="py-4 px-4 text-sm font-semibold text-slate-500 border-b border-slate-100">Date</th>
                                    <th className="py-4 px-4 text-sm font-semibold text-slate-500 border-b border-slate-100">Student</th>
                                    <th className="py-4 px-4 text-sm font-semibold text-slate-500 border-b border-slate-100">Doctor</th>
                                    <th className="py-4 px-4 text-sm font-semibold text-slate-500 border-b border-slate-100 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!stats?.recentAppointments || stats.recentAppointments.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="py-8 text-center text-slate-400">No recent activity</td>
                                    </tr>
                                ) : stats.recentAppointments.map(apt => (
                                    <tr key={apt.appointment_id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-4 px-4 text-slate-600 font-medium">
                                            {new Date(apt.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="py-4 px-4 text-slate-800">
                                            {apt.student_first} {apt.student_last}
                                        </td>
                                        <td className="py-4 px-4 text-slate-600">
                                            Dr. {apt.staff_last}
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg capitalize
                                                ${apt.status === 'completed' ? 'bg-blue-50 text-blue-600' : ''}
                                                ${apt.status === 'pending' ? 'bg-orange-50 text-orange-600' : ''}
                                                ${apt.status === 'cancelled' || apt.status === 'rejected' ? 'bg-red-50 text-red-600' : ''}
                                                ${apt.status === 'confirmed' ? 'bg-green-50 text-green-700' : ''}
                                            `}>
                                                {apt.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            <section className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">Appointment Management</h2>
                        <p className="text-sm text-slate-500 mt-1">Review and update pending clinic requests.</p>
                    </div>
                    <span className="text-sm text-slate-500">{appointments.length} appointments</span>
                </div>
                {appointmentError ? (
                    <p role="alert" className="text-sm text-red-600 py-4">{appointmentError}</p>
                ) : appointments.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4">No appointments to display.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[760px]">
                            <thead>
                                <tr className="text-sm text-slate-500 border-b border-slate-100">
                                    <th className="py-3 px-3 font-semibold">Student</th>
                                    <th className="py-3 px-3 font-semibold">Schedule</th>
                                    <th className="py-3 px-3 font-semibold">Provider</th>
                                    <th className="py-3 px-3 font-semibold">Reason</th>
                                    <th className="py-3 px-3 font-semibold">Status</th>
                                    <th className="py-3 px-3 font-semibold text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map((appointment) => (
                                    <tr key={appointment.appointment_id} className="border-b border-slate-50 last:border-0">
                                        <td className="py-4 px-3">
                                            <p className="font-medium text-slate-800">{appointment.student_first_name} {appointment.student_last_name}</p>
                                            <p className="text-xs text-slate-500">{appointment.student_number}</p>
                                        </td>
                                        <td className="py-4 px-3 text-sm text-slate-600">
                                            {new Date(appointment.slot_date).toLocaleDateString()}<br />
                                            {appointment.start_time} - {appointment.end_time}
                                        </td>
                                        <td className="py-4 px-3 text-sm text-slate-600">
                                            {appointment.staff_first_name} {appointment.staff_last_name}
                                        </td>
                                        <td className="py-4 px-3 text-sm text-slate-600 max-w-56 truncate" title={appointment.reason}>
                                            {appointment.reason}
                                        </td>
                                        <td className="py-4 px-3">
                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                                                appointment.status === 'confirmed' ? 'bg-green-50 text-green-700' :
                                                appointment.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                                                ['cancelled', 'rejected'].includes(appointment.status) ? 'bg-red-50 text-red-700' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>{appointment.status}</span>
                                        </td>
                                        <td className="py-4 px-3">
                                            {appointment.status === 'pending' ? (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAppointmentStatus(appointment.appointment_id, 'confirmed')}
                                                        className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAppointmentStatus(appointment.appointment_id, 'rejected')}
                                                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                                    >
                                                        Decline
                                                    </button>
                                                </div>
                                            ) : <span className="block text-right text-xs text-slate-400">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Add Staff Modal */}
            {showAddStaff && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-semibold mb-6">Add New Staff Member</h2>
                        
                        <form onSubmit={handleAddStaff} className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                                        value={newStaff.firstName} onChange={e => setNewStaff({...newStaff, firstName: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                                        value={newStaff.lastName} onChange={e => setNewStaff({...newStaff, lastName: e.target.value})} />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address * (for login)</label>
                                <input required type="email" className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                                    value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password *</label>
                                <input required type="password" minLength={10} maxLength={128} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                                    value={newStaff.password} onChange={e => setNewStaff({...newStaff, password: e.target.value})} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Specialization</label>
                                    <input placeholder="e.g., General Physician" className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                                        value={newStaff.specialization} onChange={e => setNewStaff({...newStaff, specialization: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Room Number</label>
                                    <input placeholder="e.g., 102A" className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                                        value={newStaff.roomNumber} onChange={e => setNewStaff({...newStaff, roomNumber: e.target.value})} />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowAddStaff(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
                                    Create Account
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
