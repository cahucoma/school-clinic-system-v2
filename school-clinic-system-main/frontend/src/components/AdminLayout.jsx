import { NavLink } from 'react-router-dom';
import { IconCalendarEvent, IconHome2, IconLogout, IconUsers } from '@tabler/icons-react';
import { useAuth } from '../context/auth';

const links = [
    { to: '/admin-dashboard', label: 'Dashboard', icon: IconHome2, end: true },
    { to: '/admin/appointments', label: 'Appointment Schedule', icon: IconCalendarEvent },
    { to: '/admin/accounts', label: 'User Management', icon: IconUsers },
];

function NavigationLinks() {
    return links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
        >
            <Icon size={19} />
            {label}
        </NavLink>
    ));
}

export default function AdminLayout({ children }) {
    const { logout } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50 md:pl-64">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-5 py-6 md:flex">
                <NavLink to="/admin-dashboard" className="mb-9 flex items-center gap-3 px-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">C</span>
                    <span>
                        <span className="block font-bold tracking-tight text-slate-900">CampusCare</span>
                        <span className="block text-xs text-slate-500">Clinic administration</span>
                    </span>
                </NavLink>
                <nav aria-label="Administrator navigation" className="flex flex-col gap-1">
                    <NavigationLinks />
                </nav>
                <button
                    type="button"
                    onClick={logout}
                    className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                >
                    <IconLogout size={19} />
                    Sign out
                </button>
            </aside>

            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
                <div className="mb-3 flex items-center justify-between">
                    <NavLink to="/admin-dashboard" className="font-bold tracking-tight text-slate-900">CampusCare Admin</NavLink>
                    <button
                        type="button"
                        onClick={logout}
                        aria-label="Sign out"
                        className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    >
                        <IconLogout size={19} />
                    </button>
                </div>
                <nav aria-label="Administrator navigation" className="flex gap-2 overflow-x-auto">
                    {links.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <Icon size={16} />
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </header>

            <div>{children}</div>
        </div>
    );
}
