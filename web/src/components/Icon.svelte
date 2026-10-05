<script lang="ts">
  let { name }: { name: string } = $props();
  const P: Record<string, string> = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    path: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    pay: 'M3 7h18v12H3zM3 11h18M7 15h3',
    att: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    kb: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM8 7h6M8 11h6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
    news: 'M5 4h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2zM18 8h2v9a2 2 0 0 1-2 2M8 8h6M8 12h6M8 15h4',
    growth: 'M12 21V9M12 9c0-3 2-5 6-5 0 4-2 6-6 5zM12 13c0-2.5-1.5-4-5-4 0 3.5 1.5 5 5 4z',
    training: 'M3 9l9-4 9 4-9 4zM7 11v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5M21 9v6',
    tests: 'M9 4h6l1 2h3v14H5V6h3zM9 12l2 2 4-4',
    library: 'M4 5v14M8 5v14M12 6l4 13 4-1-4-13z',
    schedule: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.01',
    assist: 'M12 3a7 7 0 0 0-7 7v3a2 2 0 0 0 2 2h1v-5H5M12 3a7 7 0 0 1 7 7v3a2 2 0 0 1-2 2h-1v-5h3M16 17c0 2-2 3-4 3',
    team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M16 11a2.5 2.5 0 1 0 0-5M17 14a5 5 0 0 1 4 5',
    admin: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
    chev: 'M9 6l6 6-6 6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  };
</script>
<svg viewBox="0 0 24 24" aria-hidden="true"><path d={P[name]} /></svg>
