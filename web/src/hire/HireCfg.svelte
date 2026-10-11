<script lang="ts">
  import { api } from '../lib/api';
  import { hs, loadMeta, toast, errText, ht, hg } from './store.svelte';

  type Col = [string, string, 'text' | 'check' | 'number' | 'color' | 'type' | 'area' | 'date'];
  interface Def { key: string; title: string; metaKey: string; cols: Col[]; pk?: string }
  const DEFS: Def[] = [
    { key: 'statuses', title: 'hStages', metaKey: 'statuses', cols: [['name', 'hName', 'text'], ['name_uz', 'hNameUz', 'text'], ['type', 'hType', 'type'], ['color', 'hColor', 'color'], ['max_days', 'hMaxDays', 'number'], ['active', 'hOn', 'check']] },
    { key: 'reasons', title: 'hReasons', metaKey: 'reasons', cols: [['name', 'hName', 'text'], ['name_uz', 'hNameUz', 'text'], ['active', 'hOn', 'check']] },
    { key: 'sources', title: 'hSources', metaKey: 'sources', cols: [['name', 'hName', 'text'], ['active', 'hOn', 'check']] },
    { key: 'tags', title: 'hTagsC', metaKey: 'tags', cols: [['name', 'hName', 'text'], ['color', 'hColor', 'color']] },
    { key: 'templates', title: 'hTemplates', metaKey: 'templates', cols: [['name', 'hName', 'text'], ['subject', 'hSubject', 'text'], ['body', 'hBody', 'area']] },
    { key: 'holidays', title: 'hHolidays', metaKey: 'holidays', pk: 'day', cols: [['day', 'hDay', 'date'], ['name', 'hName', 'text']] },
    { key: 'fields', title: 'hFields', metaKey: 'fields', cols: [['form', 'hForm', 'text'], ['key', 'hKey', 'text'], ['label', 'hLabel', 'text'], ['label_uz', 'hLabelUz', 'text'], ['type', 'hType', 'text'], ['required', 'hReqF', 'check'], ['ord', 'hOrd', 'number'], ['active', 'hOn', 'check']] },
  ];
  const STAGE_TYPES = ['new', 'work', 'interview', 'offer', 'hired', 'rejected'];
  let rows: Record<string, any[]> = $state({}), fresh: Record<string, Record<string, any>> = $state({}), err = $state(''), hm = $state(hs.meta!.settings.hm_contacts);

  const sync = () => { for (const d of DEFS) rows[d.key] = JSON.parse(JSON.stringify((hs.meta as any)[d.metaKey])); };
  sync();
  for (const d of DEFS) fresh[d.key] = Object.fromEntries(d.cols.map(([k, , t]) => [k, t === 'check' ? true : t === 'color' ? '#8b5cf6' : t === 'number' ? null : '']));
  const idOf = (d: Def, r: any) => (d.pk ? String(r[d.pk]).slice(0, 10) : r.id);
  const body = (r: Record<string, any>) => r;
  async function after(ok: boolean, e?: unknown) { if (ok) { await loadMeta(); sync(); err = ''; } else err = errText(e); }
  async function save(d: Def, r: any) { try { await api.patch(`/api/hire/cfg/${d.key}/${idOf(d, r)}`, body(r)); toast(ht('hSaved')); await after(true); } catch (e) { await after(false, e); } }
  async function remove(d: Def, r: any) { try { const x = await api.del(`/api/hire/cfg/${d.key}/${idOf(d, r)}`); if (x.deactivated) toast(ht('hDeact')); await after(true); } catch (e) { await after(false, e); } }
  async function add(d: Def) { try { await api.post(`/api/hire/cfg/${d.key}`, body(fresh[d.key])); await after(true); } catch (e) { await after(false, e); } }
  async function move(r: any, dir: number) {
    const ids = hs.meta!.statuses.map((s) => s.id), i = ids.indexOf(r.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.post('/api/hire/cfg/statuses/reorder', { ids }); await after(true); } catch (e) { await after(false, e); }
  }
  async function saveGeneral() { try { await api.patch('/api/hire/settings', { hm_contacts: hm }); await loadMeta(); toast(ht('hSaved')); } catch (e) { err = errText(e); } }
</script>

{#if err}<p class="alert" style="margin-bottom:14px">{err}</p>{/if}
<div class="stack" style="gap:20px">
  <section class="card stack"><h3 class="card-title">{ht('hGeneral')}</h3>
    <p class="muted small">{ht('hTz')}: {hs.meta!.settings.tz}</p>
    <label class="row" style="gap:8px"><input type="checkbox" bind:checked={hm} /> {ht('hHmC')}</label>
    <div><button class="btn grad" onclick={saveGeneral}>{ht('hSave')}</button></div></section>

  {#each DEFS as d (d.key)}
    <section class="card stack" style="overflow-x:auto"><h3 class="card-title">{ht(d.title)}</h3>
      <table class="table">
        <thead><tr>{#each d.cols as c}<th>{ht(c[1])}</th>{/each}<th></th></tr></thead>
        <tbody>
          {#each rows[d.key] as r (idOf(d, r))}
            <tr>
              {#each d.cols as [k, lab, type]}
                <td>
                  {#if d.pk === k}{String(r[k]).slice(0, 10)}
                  {:else if type === 'check'}<input type="checkbox" aria-label={ht(lab)} bind:checked={r[k]} />
                  {:else if type === 'type'}<select aria-label={ht(lab)} bind:value={r[k]}>{#each STAGE_TYPES as s}<option value={s}>{hg('hStageT', s)}</option>{/each}</select>
                  {:else if type === 'area'}<textarea aria-label={ht(lab)} bind:value={r[k]} style="min-height:48px"></textarea>
                  {:else if type === 'number'}<input type="number" aria-label={ht(lab)} bind:value={r[k]} style="width:90px" />
                  {:else if type === 'color'}<input type="color" aria-label={ht(lab)} bind:value={r[k]} style="width:56px;padding:2px" />
                  {:else}<input aria-label={ht(lab)} bind:value={r[k]} />{/if}
                </td>
              {/each}
              <td style="white-space:nowrap">
                <button class="btn sm" onclick={() => save(d, r)}>{ht('hSave')}</button>
                {#if d.key === 'statuses'}<button class="btn sm" aria-label={ht('hUp')} onclick={() => move(r, -1)}>↑</button><button class="btn sm" aria-label={ht('hDown')} onclick={() => move(r, 1)}>↓</button>{/if}
                <button class="btn sm danger" onclick={() => remove(d, r)}>{ht('hDel')}</button>
              </td>
            </tr>
          {/each}
          <tr>
            {#each d.cols as [k, lab, type]}
              <td>
                {#if type === 'check'}<input type="checkbox" aria-label={ht(lab)} bind:checked={fresh[d.key][k]} />
                {:else if type === 'type'}<select aria-label={ht(lab)} bind:value={fresh[d.key][k]}>{#each STAGE_TYPES as s}<option value={s}>{hg('hStageT', s)}</option>{/each}</select>
                {:else if type === 'area'}<textarea aria-label={ht(lab)} bind:value={fresh[d.key][k]} style="min-height:48px"></textarea>
                {:else if type === 'number'}<input type="number" aria-label={ht(lab)} bind:value={fresh[d.key][k]} style="width:90px" />
                {:else if type === 'color'}<input type="color" aria-label={ht(lab)} bind:value={fresh[d.key][k]} style="width:56px;padding:2px" />
                {:else if type === 'date'}<input type="date" aria-label={ht(lab)} bind:value={fresh[d.key][k]} />
                {:else}<input aria-label={ht(lab)} bind:value={fresh[d.key][k]} />{/if}
              </td>
            {/each}
            <td><button class="btn sm grad" onclick={() => add(d)}>{ht('hAdd')}</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  {/each}
</div>
