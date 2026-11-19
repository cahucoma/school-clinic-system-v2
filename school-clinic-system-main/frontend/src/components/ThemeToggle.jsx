import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTheme } from '../context/useTheme';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    const Icon = theme === 'light' ? IconMoon : IconSun;

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} mode`}
            aria-pressed={theme === 'dark'}
            title={`Switch to ${nextTheme} mode`}
            className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-lg transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-blue-600"
        >
            <Icon size={18} aria-hidden="true" />
            <span>{nextTheme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        </button>
    );
}
