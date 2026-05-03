const systemDarkQuery = '(prefers-color-scheme: dark)';

export function syncSystemColorScheme() {
  const media = window.matchMedia(systemDarkQuery);

  applyColorScheme(media.matches);

  const handleChange = (event: MediaQueryListEvent) => {
    applyColorScheme(event.matches);
  };

  media.addEventListener('change', handleChange);

  return () => {
    media.removeEventListener('change', handleChange);
  };
}

function applyColorScheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}
