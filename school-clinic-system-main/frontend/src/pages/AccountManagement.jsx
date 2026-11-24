import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

const EMPTY_STUDENT = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    studentNumber: '',
    dob: '',
    contactNumber: '',
};

export default function AccountManagement() {
    const [tab, setTab] = useState('students');
    const [students, setStudents] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
    const [filters, setFilters] = useState({ search: '', status: 'all', role: 'all', sort: 'created_at', order: 'desc' });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [form, setForm] = useState(EMPTY_STUDENT);

    const loadStudents = useCallback(async (page = pagination.page) => {
        setLoading(true);
        try {
            const response = await api.get('/admin/students', {
                params: { page, limit: pagination.limit, ...filters },
            });
            setStudents(response.data.students);
            setPagination(response.data.pagination);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to load student accounts.' });
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.limit, pagination.page]);

    const loadAccounts = useCallback(async (page = pagination.page) => {
        setLoading(true);
        try {
            const response = await api.get('/admin/accounts', {
                params: { page, limit: pagination.limit, ...filters },
            });
            setAccounts(response.data.accounts);
            setPagination(response.data.pagination);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to load accounts.' });
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.limit, pagination.page]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (tab === 'students') loadStudents(1);
            else loadAccounts(1);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [tab, filters, loadStudents, loadAccounts]);

    const openCreate = () => {
        setEditingStudent(null);
        setForm(EMPTY_STUDENT);
        setShowForm(true);
    };

    const openEdit = (student) => {
        setEditingStudent(student);
        setForm({
            firstName: student.first_name,
            lastName: student.last_name,
            email: student.email,
            password: '',
            studentNumber: student.student_number,
            dob: student.dob?.slice(0, 10) || '',
            contactNumber: student.contact_number || '',
        });
        setShowForm(true);
    };

    const submitStudent = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            if (editingStudent) {
                await api.put(`/admin/students/${editingStudent.student_id}`, form);
                setNotice({ type: 'success', text: 'Student account updated.' });
            } else {
                await api.post('/admin/students', form);
                setNotice({ type: 'success', text: 'Student account created.' });
            }
            setShowForm(false);
            await loadStudents(1);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to save student account.' });
        } finally {
            setSaving(false);
        }
    };

    const setStudentStatus = async (student, status) => {
        if (!window.confirm(`${status === 'active' ? 'Activate' : 'Deactivate'} ${student.first_name} ${student.last_name}?`)) return;
        try {
            await api.put(`/admin/students/${student.student_id}/status`, { status });
            setNotice({ type: 'success', text: status === 'active' ? 'Student account activated.' : 'Student account deactivated.' });
            await loadStudents(pagination.page);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update student status.' });
        }
    };

    const setAccountStatus = async (account, status) => {
        if (!window.confirm(`${status === 'active' ? 'Activate' : 'Deactivate'} ${account.email}?`)) return;
        try {
            await api.put(`/admin/accounts/${account.user_id}/status`, { status });
            setNotice({ type: 'success', text: status === 'active' ? 'Account activated.' : 'Account deactivated.' });
            await loadAccounts(pagination.page);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update account status.' });
        }
    };

    const setAccountRole = async (account, role) => {
        if (!window.confirm(`Change ${account.email} to ${role}?`)) return;
        try {
            await api.put(`/admin/accounts/${account.user_id}/role`, { role });
            setNotice({ type: 'success', text: 'Account role updated.' });
            await loadAccounts(pagination.page);
        } catch (error) {
            setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to update account role.' });
        }
    };

    return (
        <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
            <header>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Administration</p>
                <h1 className="mt-1 text-3xl font-bold text-slate-900">User and Student Management</h1>
            </header>

            {notice && (
                <div role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {notice.text}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-xl bg-slate-100 p-1">
                    {['students', 'accounts'].map((value) => (
                        <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                            {value === 'students' ? 'Students' : 'All accounts'}
                        </button>
                    ))}
                </div>
                {tab === 'students' && (
                    <button type="button" onClick={openCreate} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Add student</button>
                )}
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-5 grid gap-3 md:grid-cols-4">
                    <input type="search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search name, number or email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
                    <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    {tab === 'accounts' ? (
                        <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                            <option value="all">All roles</option>
                            <option value="student">Student</option>
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                        </select>
                    ) : (
                        <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                            <option value="created_at">Newest</option>
                            <option value="student_number">Student number</option>
                            <option value="first_name">First name</option>
                            <option value="last_name">Last name</option>
                        </select>
                    )}
                </div>

                {loading ? (
                    <p role="status" className="py-10 text-center text-sm text-slate-500">Loading accounts…</p>
                ) : tab === 'students' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                                    <th className="px-3 py-3">Student</th>
                                    <th className="px-3 py-3">Student number</th>
                                    <th className="px-3 py-3">Email</th>
                                    <th className="px-3 py-3">Status</th>
                                    <th className="px-3 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student) => (
                                    <tr key={student.student_id} className="border-b border-slate-50">
                                        <td className="px-3 py-4 font-semibold text-slate-800">{student.first_name} {student.last_name}</td>
                                        <td className="px-3 py-4 text-sm text-slate-600">{student.student_number}</td>
                                        <td className="px-3 py-4 text-sm text-slate-600">{student.email}</td>
                                        <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${student.account_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{student.account_status}</span></td>
                                        <td className="px-3 py-4">
                                            <div className="flex justify-end gap-2">
                                                <button type="button" onClick={() => openEdit(student)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                                                <button type="button" onClick={() => setStudentStatus(student, student.account_status === 'active' ? 'inactive' : 'active')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${student.account_status === 'active' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {student.account_status === 'active' ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {students.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No student accounts match this filter.</p>}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                                    <th className="px-3 py-3">Account</th>
                                    <th className="px-3 py-3">Role</th>
                                    <th className="px-3 py-3">Status</th>
                                    <th className="px-3 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((account) => (
                                    <tr key={account.user_id} className="border-b border-slate-50">
                                        <td className="px-3 py-4"><p className="font-semibold text-slate-800">{account.first_name ? `${account.first_name} ${account.last_name}` : account.email}</p><p className="text-xs text-slate-500">{account.email}</p></td>
                                        <td className="px-3 py-4">
                                            <select value={account.role} onChange={(event) => setAccountRole(account, event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm capitalize">
                                                <option value="student">Student</option>
                                                <option value="staff">Staff</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </td>
                                        <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.account_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{account.account_status}</span></td>
                                        <td className="px-3 py-4 text-right">
                                            <button type="button" onClick={() => setAccountStatus(account, account.account_status === 'active' ? 'inactive' : 'active')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${account.account_status === 'active' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                {account.account_status === 'active' ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {accounts.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No accounts match this filter.</p>}
                    </div>
                )}

                <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.total} total</p>
                    <div className="flex gap-2">
                        <button type="button" disabled={pagination.page <= 1} onClick={() => tab === 'students' ? loadStudents(pagination.page - 1) : loadAccounts(pagination.page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Previous</button>
                        <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => tab === 'students' ? loadStudents(pagination.page + 1) : loadAccounts(pagination.page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Next</button>
                    </div>
                </div>
            </section>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4">
                    <form onSubmit={submitStudent} className="my-auto w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-slate-900">{editingStudent ? 'Edit student account' : 'Create student account'}</h2>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            {[
                                ['firstName', 'First name', 'text'],
                                ['lastName', 'Last name', 'text'],
                                ['studentNumber', 'Student number', 'text'],
                                ['dob', 'Date of birth', 'date'],
                                ['contactNumber', 'Contact number', 'tel'],
                            ].map(([key, label, type]) => (
                                <label key={key} className="block text-sm font-medium text-slate-700">
                                    {label}
                                    <input required={key !== 'contactNumber'} type={type} value={form[key]} maxLength={key === 'studentNumber' ? 50 : 100} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" />
                                </label>
                            ))}
                            {!editingStudent && (
                                <>
                                    <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                                        Email
                                        <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" />
                                    </label>
                                    <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                                        Temporary password
                                        <input required type="password" minLength={10} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" />
                                    </label>
                                </>
                            )}
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                {saving ? 'Saving…' : editingStudent ? 'Save changes' : 'Create account'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
