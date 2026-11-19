import { useLayoutEffect, useState } from 'react';
import { ThemeContext } from './theme';

const STORAGE_KEY = 'school-clinic-theme';

export default function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => (
        window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
    ));

    useLayoutEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        window.localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const toggleTheme = () => setTheme((currentTheme) => (
        currentTheme === 'light' ? 'dark' : 'light'
    ));

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
