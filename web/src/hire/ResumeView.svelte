<script lang="ts">
  import { api } from '../lib/api';
  import { ht, toast, errText } from './store.svelte';

  // Резюме кандидата в виде документа: желаемая должность, опыт по местам, образование, навыки, языки, о себе. Всё на виду.
  let { profile, rec, applicantId, aiOn, onchange }: { profile: any; rec: boolean; applicantId: number; aiOn: boolean; onchange: () => void } = $props();
  const d = $derived(profile?.data);
  let raw = $state(false), text = $state(''), busy = $state(false);
  const hasAny = $derived(!!d && (d.experience?.length || d.education?.length || d.skills?.length || d.languages?.length || d.about || d.courses?.length || d.additional?.length || d.desired?.position));
  const personal = $derived([d?.personal?.gender === 'м' ? 'Мужчина' : d?.personal?.gender === 'ж' ? 'Женщина' : '', d?.personal?.age ? `${d.personal.age} лет` : '', d?.personal?.birthday ? `родился ${d.personal.birthday}` : '', d?.personal?.location].filter(Boolean).join(' · '));
  const src = $derived(profile?.source === 'ai' ? ht('rvSrcAi') : profile?.source === 'manual' ? ht('rvSrcManual') : ht('rvSrcRules'));

  function openRaw() { raw = !raw; if (raw) text = profile?.raw_text ?? ''; }
  async function reparse() {
    busy = true;
    try { await api.put(`/api/hire/applicants/${applicantId}/profile`, { text }); toast(ht('hSaved')); onchange(); } catch (e) { toast(errText(e), true); } finally { busy = false; }
  }
  async function aiParse() {
    busy = true;
    try { await api.post(`/api/hire/applicants/${applicantId}/profile/ai`); toast(ht('hSaved')); onchange(); }
    catch (e: any) { toast(e?.code === 'ai_unavailable' ? `${ht('aiOff')}: ${ht('aiOff_' + (e.body?.reason ?? 'no_key'))}` : e?.code === 'ai_bad_answer' ? ht('aiBad') : errText(e), true); } finally { busy = false; }
  }
</script>

<section class="card rs">
  <header class="rh"><h3 class="card-title">{ht('rvTitle')}</h3>{#if profile}<span class="muted xs">{src}</span>{/if}</header>

  {#if !profile}<p class="muted">{ht('rvEmpty')}</p>
  {:else}
    {#if d.desired?.position || d.desired?.salary || d.desired?.specializations || d.desired?.employment || d.desired?.format || d.total_experience}
      <div class="blk">
        {#if d.desired.position}<h2 class="pos">{d.desired.position}</h2>{/if}
        <dl>
          {#if d.desired.salary}<dt>{ht('rvSalary')}</dt><dd>{d.desired.salary}</dd>{/if}
          {#if d.total_experience}<dt>{ht('rvTotal')}</dt><dd>{d.total_experience}</dd>{/if}
          {#if d.desired.specializations}<dt>{ht('rvSpec')}</dt><dd>{d.desired.specializations}</dd>{/if}
          {#if d.desired.employment}<dt>{ht('rvEmp')}</dt><dd>{d.desired.employment}</dd>{/if}
          {#if d.desired.format}<dt>{ht('rvFormat')}</dt><dd>{d.desired.format}</dd>{/if}
        </dl>
      </div>
    {/if}

    {#if d.experience?.length}
      <div class="blk"><h4>{ht('rvExp')}</h4>
        <ol class="jobs">
          {#each d.experience as j}
            <li>
              <div class="when"><b>{j.period}</b>{#if j.duration}<span class="muted xs">{j.duration}</span>{/if}</div>
              <div class="what">
                <b class="co">{j.company || '—'}</b>
                {#if j.position}<div class="role">{j.position}</div>{/if}
                {#if j.industry}<div class="muted small">{ht('rvIndustry')}: {j.industry}</div>{/if}
                {#if j.description?.length}<ul class="duties">{#each j.description as t}<li>{t}</li>{/each}</ul>{/if}
              </div>
            </li>
          {/each}
        </ol>
      </div>
    {:else if hasAny || profile.raw_text}<p class="muted small">{ht('rvNoExp')}</p>{/if}

    {#if d.education?.length}
      <div class="blk"><h4>{ht('rvEdu')}</h4>
        {#each d.education as e}<div class="line"><b>{e.institution}</b>{#if e.level} <span class="chip sm">{e.level}</span>{/if}{#if e.details}<div class="muted small">{e.details}</div>{/if}</div>{/each}
      </div>
    {/if}
    {#if d.skills?.length}
      <div class="blk"><h4>{ht('rvSkills')}</h4>
        {#each d.skills as s}<div class="line">{#if s.level}<span class="muted xs">{s.level}</span>{/if}<div>{s.text}</div></div>{/each}
      </div>
    {/if}
    {#if d.languages?.length}
      <div class="blk"><h4>{ht('rvLang')}</h4><div class="langs">{#each d.languages as l}<span class="chip">{l.name}{#if l.level}<span class="muted"> · {l.level}</span>{/if}</span>{/each}</div></div>
    {/if}
    {#if d.courses?.length}
      <div class="blk"><h4>{ht('rvCourses')}</h4><ul class="duties">{#each d.courses as c}<li>{c}</li>{/each}</ul></div>
    {/if}
    {#if d.about}<div class="blk"><h4>{ht('rvAbout')}</h4><p>{d.about}</p></div>{/if}
    {#if d.additional?.length}
      <div class="blk"><h4>{ht('rvAdd')}</h4>
        <dl>{#each d.additional.filter((a: any) => !/гражданств/i.test(a.key)) as a}<dt>{a.key}</dt><dd>{a.value}</dd>{/each}</dl>
      </div>
    {/if}
    {#if rec && personal}<div class="blk muted small" title={ht('rvPersonal')}>{ht('rvPersonal')}: {personal}</div>{/if}

    {#if rec}
      <div class="row wrap u-33fcd4c">
        <button type="button" class="btn sm" onclick={openRaw}>{ht('rvRaw')}</button>
        {#if aiOn}<button type="button" class="btn sm" disabled={busy} onclick={aiParse}>{ht('rvAiParse')}</button>{/if}
      </div>
      {#if raw}
        <p class="muted xs">{ht('rvEditHint')}</p>
        <textarea class="rawtxt" bind:value={text} maxlength="60000" aria-label={ht('rvRaw')}></textarea>
        <button type="button" class="btn sm grad u-c9adc42" disabled={busy || text.trim().length < 10} onclick={reparse}>{ht('rvReparse')}</button>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .rs { display: flex; flex-direction: column; gap: 18px; }
  .rh { display: flex; justify-content: space-between; align-items: baseline; }
  .pos { font-size: 22px; margin-bottom: 10px; }
  h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 5px 18px; margin: 0; font-size: 14.5px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .blk { border-top: 1px solid var(--border); padding-top: 14px; }
  .blk:first-of-type { border-top: 0; padding-top: 0; }
  .jobs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 18px; }
  .jobs > li { display: grid; grid-template-columns: 150px 1fr; gap: 16px; }
  .when { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
  .what { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-left: 14px; border-left: 2px solid var(--accent); }
  .co { font-size: 16px; overflow-wrap: anywhere; }
  .role { font-weight: 600; }
  .duties { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 14.5px; }
  .line { padding: 4px 0; }
  .langs { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip.sm { padding: 2px 9px; font-size: 12px; }
  .rawtxt { min-height: 220px; font-size: 13px; }
  p { margin: 0; line-height: 1.55; overflow-wrap: anywhere; }
  @media (max-width: 880px) { .jobs > li { grid-template-columns: 1fr; gap: 6px; } }
</style>
