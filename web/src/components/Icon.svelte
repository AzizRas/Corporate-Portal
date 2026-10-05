<script lang="ts">
  let { name }: { name: string } = $props();
  const P: Record<string, string> = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    path: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    pay: 'M3 7h18v12H3zM3 11h18M7 15h3',
    att: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    kb: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM8 7h6M8 11h6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  };
</script>
<svg viewBox="0 0 24 24" aria-hidden="true"><path d={P[name]} /></svg>
