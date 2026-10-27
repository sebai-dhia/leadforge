// Applies the saved theme before the page paints, so a light or dark choice does not flash the other one first.
try { const t = localStorage.getItem('lf-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* system theme */ }
