<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { hs, toast, errText, ht, extraHref } from './store.svelte';

  // Сообщение кандидату по шаблону: Telegram, WhatsApp или почта. Имя, вакансия и время ближайшей встречи подставляются сами.
  let { applicant, applicantId, pipelines, interviews, extras, onchange }: { applicant: any; applicantId: number; pipelines: any[]; interviews: any[]; extras: any[]; onchange: () => void } = $props();
  let tpl = $state(''), subject = $state(''), body = $state(''), pid = $state(0);
  const open = $derived(pipelines.filter((p) => p.vacancy_state !== 'closed'));
  const cur = $derived(pipelines.find((p) => p.id === (pid || open[0]?.id)) ?? pipelines[0] ?? null);
  const itv = $derived(cur ? interviews.filter((i) => i.pipeline_id === cur.id).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0] ?? null : null);
  const loc = () => (app.lang === 'uz' ? 'uz-UZ' : 'ru-RU');
  const vars = $derived<Record<string, string>>({
    name: applicant.first_name ?? '', sender: app.user?.name ?? '', vacancy: cur?.vacancy_title ?? '',
    date: itv ? new Date(itv.starts_at).toLocaleDateString(loc(), { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
    time: itv ? new Date(itv.starts_at).toLocaleTimeString(loc(), { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
    place: itv?.place ?? '', link: itv?.link ?? '',
  });
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (vars[k] || m) : m)).replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n');
  const left = $derived([...new Set([...(subject + body).matchAll(/\{(\w+)\}/g)].map((m) => `{${m[1]}}`))]);
  const groups = $derived({ ru: hs.meta!.templates.filter((t) => t.name.startsWith('RU · ')), uz: hs.meta!.templates.filter((t) => t.name.startsWith('UZ · ')), own: hs.meta!.templates.filter((t) => !/^(RU|UZ) · /.test(t.name)) });
  const preferUz = $derived(app.lang === 'uz');

  function apply() {
    const t = hs.meta!.templates.find((x) => x.id === Number(tpl));
    if (t) { subject = fill(t.subject); body = fill(t.body); }
  }
  // при смене вакансии подставляем заново: подстановка идёт из исходного шаблона
  function reapply() { if (tpl) apply(); }

  const tgExtra = $derived(extras.find((x) => x.kind === 'telegram'));
  const waExtra = $derived(extras.find((x) => x.kind === 'whatsapp'));
  const digits = $derived((applicant.phone ?? '').replace(/\D/g, ''));
  const text = () => (subject.trim() ? `${subject.trim()}\n\n${body.trim()}` : body.trim());
  async function log(ch: string) { try { await api.post(`/api/hire/applicants/${applicantId}/notes`, { kind: 'email', body: `${ht('mLog', { ch })}: ${subject.trim() || body.trim().slice(0, 60)}` }); onchange(); } catch (e) { toast(errText(e), true); } }
  async function copy() { try { await navigator.clipboard.writeText(text()); return true; } catch { return false; } }
  async function telegram() {
    const ok = await copy();
    if (ok) toast(ht('mCopied'));
    const href = tgExtra ? extraHref('telegram', tgExtra.value) : digits ? `https://t.me/+${digits}` : null;
    if (href) window.open(href, '_blank', 'noopener');
    await log('Telegram');
  }
  async function whatsapp() {
    const num = waExtra ? extraHref('whatsapp', waExtra.value) : null;
    const base = num ? num.split('?')[0] : digits ? `https://wa.me/${digits}` : null;
    if (base) window.open(`${base}?text=${encodeURIComponent(text())}`, '_blank', 'noopener');
    await log('WhatsApp');
  }
  async function mail() { await log('email'); location.href = `mailto:${applicant.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }
</script>

<section class="card stack">
  <h3 class="card-title">{ht('mTitle')}</h3>
  <p class="muted xs">{ht('mHint')}</p>
  {#if open.length > 1}<select bind:value={pid} onchange={reapply} aria-label={ht('mVac')}><option value={0}>{ht('mVac')}: {open[0].vacancy_title}</option>{#each open.slice(1) as p}<option value={p.id}>{p.vacancy_title}</option>{/each}</select>{/if}
  <select aria-label={ht('mTpl')} bind:value={tpl} onchange={apply}>
    <option value="">{ht('mTpl')}…</option>
    {#each (preferUz ? ['uz', 'ru', 'own'] : ['ru', 'uz', 'own']) as g}
      {#if groups[g as 'ru' | 'uz' | 'own'].length}<optgroup label={g === 'ru' ? 'Русский' : g === 'uz' ? 'Oʻzbekcha' : '★'}>{#each groups[g as 'ru' | 'uz' | 'own'] as t}<option value={t.id}>{t.name.replace(/^(RU|UZ) · /, '')}</option>{/each}</optgroup>{/if}
    {/each}
  </select>
  <input bind:value={subject} placeholder={ht('mTopic')} aria-label={ht('mTopic')} />
  <textarea class="u-dddd515" bind:value={body} placeholder={ht('mText')} aria-label={ht('mText')}></textarea>
  {#if left.length}<p class="warn small">{ht('mFill', { n: left.join(' ') })}</p>{/if}
  <div class="row wrap u-33fcd4c">
    <button type="button" class="btn grad" disabled={!body.trim() || (!tgExtra && !digits)} onclick={telegram}>{ht('mTg')}</button>
    <button type="button" class="btn" disabled={!body.trim() || (!waExtra && !digits)} onclick={whatsapp}>{ht('mWa')}</button>
    <button type="button" class="btn" disabled={!body.trim() || !applicant.email} onclick={mail}>{ht('mMail')}</button>
  </div>
  {#if !tgExtra && digits}<p class="muted xs">{ht('mNoTg')}</p>{/if}
</section>

<style>
  .warn { color: var(--warn); margin: 0; }
  p { margin: 0; }
</style>
