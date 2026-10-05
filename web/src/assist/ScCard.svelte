<script lang="ts">
  import { copy } from './store.svelte';
  import { at } from './i18n';
  import { fmtTel, scClientText } from './logic';
  let { s }: { s: any } = $props();
</script>
<div class="sccard">
  <div class="sch"><b>{s.reg}</b><span class="tag" title={at('sc_crm_title')}>{s.crm}</span><small class="as-hint">{at('sc_eng')}: {s.eng}</small></div>
  <ul>
    {#each s.people as p}
      <li><span>{p.n}</span>
        {#if p.blocked}<s>{fmtTel(p.tel)}</s> <span class="pill bad">{at('sc_blocked')}</span>
        {:else}<b>{fmtTel(p.tel)}</b><button class="cp" onclick={() => copy(fmtTel(p.tel), at('copied'))}>{at('copy')}</button>{/if}</li>
    {/each}
  </ul>
  {#if s.addrs.length}
    <ul>
      {#each s.addrs as a}
        <li><span>{a.a}{#if a.m}<span class="lm">{at('sc_lm')}: {a.m}</span>{/if}{#if a.who}<span class="lm">{at('sc_who')}: {a.who}</span>{/if}</span>
          <button class="cp" onclick={() => copy(a.a + (a.m ? `, ориентир — ${a.m}` : ''), at('copied'))}>{at('copy_addr')}</button></li>
      {/each}
    </ul>
  {:else}<span class="pill mid">{at('sc_noaddr')}</span>{/if}
  {#if s.note}<div class="box gap">{s.note}</div>{/if}
  {#if s.addrs.length}<div><button class="cp" style="margin:0" onclick={() => copy(scClientText(s), at('copied'))}>{at('copy_client')}</button></div>{/if}
</div>
