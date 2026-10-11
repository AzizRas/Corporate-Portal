<script lang="ts">
  let { pct, label = '' }: { pct: number; label?: string } = $props();
  const R = 54, C = 2 * Math.PI * R;
  const off = $derived(C * (1 - Math.min(Math.max(pct, 0), 100) / 100));
  const id = 'rg' + Math.random().toString(36).slice(2, 7);
</script>
<div class="ring-wrap">
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6865D4" /><stop offset="1" stop-color="#25CFE8" /></linearGradient></defs>
    <circle cx="60" cy="60" r={R} fill="none" stroke="var(--track)" stroke-width="7" />
    <circle class="u-02b48e2" cx="60" cy="60" r={R} fill="none" stroke="url(#{id})" stroke-width="7" stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={off} />
  </svg>
  <div class="ring-val"><b>{pct}%</b>{#if label}<span>{label}</span>{/if}</div>
</div>
