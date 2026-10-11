<script lang="ts">
  // Заглушка на время загрузки: серые полосы вместо пустого места или крутилки. lines — число строк, card — как карточка, rows — как таблица.
  let { lines = 3, card = false, rows = 0 }: { lines?: number; card?: boolean; rows?: number } = $props();
</script>

<div class="sk" class:card aria-busy="true" aria-live="polite" role="status">
  <span class="sr-only">…</span>
  {#if rows}
    {#each Array(rows) as _, i}<div class="sk-row"><i class="sk-b" style:width="22%"></i><i class="sk-b" style:width={`${50 + ((i * 17) % 30)}%`}></i><i class="sk-b" style:width="12%"></i></div>{/each}
  {:else}
    {#each Array(lines) as _, i}<i class="sk-b" style:width={i === lines - 1 && lines > 1 ? '60%' : '100%'}></i>{/each}
  {/if}
</div>

<style>
  .sk { display: flex; flex-direction: column; gap: 10px; padding: 2px 0; }
  .sk.card { padding: 18px 20px; border: 1px solid var(--border); border-radius: 18px; background: var(--card); }
  .sk-b { display: block; height: 14px; border-radius: 6px; background: linear-gradient(90deg, var(--track) 25%, color-mix(in srgb, var(--track) 55%, var(--text) 8%) 50%, var(--track) 75%); background-size: 200% 100%; animation: sk 1.3s ease-in-out infinite; }
  .sk-row { display: flex; gap: 14px; align-items: center; }
  .sk-row .sk-b:nth-child(2) { flex: 1; }
  @keyframes sk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .sk-b { animation: none; } }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
