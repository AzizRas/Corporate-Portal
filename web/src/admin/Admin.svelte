<script lang="ts">
  import { adminHome } from '../lib/nav';
  import { wt } from '../lib/w18n';
  import Users from './Users.svelte';
  import PayrollAdmin from './PayrollAdmin.svelte';
  import AttendanceAdmin from './AttendanceAdmin.svelte';
  import KbAdmin from './KbAdmin.svelte';
  import AssistAdmin from './AssistAdmin.svelte';
  import GrowthAdmin from './GrowthAdmin.svelte';
  import TrainingAdmin from './TrainingAdmin.svelte';
  import WellnessAdmin from './WellnessAdmin.svelte';
  import '../growth/growth.css';
  import Requests from './Requests.svelte';
  import Audit from './Audit.svelte';
  import AiAdmin from './AiAdmin.svelte';
  import TourStats from './TourStats.svelte';
  import AccessAdmin from './AccessAdmin.svelte';
  import UsageAdmin from './UsageAdmin.svelte';
  import TestsAdmin from './TestsAdmin.svelte';
  import KbWiki from './KbWiki.svelte';
  import DecideAdmin from './DecideAdmin.svelte';
  import PlatformAdmin from './PlatformAdmin.svelte';

  // Режим «Управление» (ТЗ №4, A7): группы и вкладки рисует HubTabs по реестру пунктов (nav.ts → ADMIN_HUBS), подписи ru/uz лежат в w18n.ts (ai_*, m_*),
  // а видимость задаёт реестр, а не эта страница. Здесь только выбор страницы по первому сегменту после /admin; новые адреса (org, onboarding, leaves, offboarding,
  // analytics, reviews, reserve, questions, editor) показывает Router, пока эпик J не разнесёт старые многоцелевые страницы.
  let { parts }: { parts: string[] } = $props();
  const cur = $derived(parts[0]);
  // /admin без вкладки ведёт на первую доступную вкладку режима (обычно это делает REDIRECTS ещё до отрисовки)
  $effect(() => { if (!cur) { const first = adminHome(); if (first) location.replace('#' + first); } });
</script>

{#if cur === 'users'}<Users />
{:else if cur === 'payroll'}<PayrollAdmin />
{:else if cur === 'attendance'}<AttendanceAdmin />
{:else if cur === 'kb'}<KbAdmin />
{:else if cur === 'wiki'}<KbWiki />
{:else if cur === 'decide'}<DecideAdmin />
{:else if cur === 'platform'}<PlatformAdmin />
{:else if cur === 'growth'}<GrowthAdmin />
{:else if cur === 'training'}<TrainingAdmin />
{:else if cur === 'tests'}<TestsAdmin />
{:else if cur === 'wellness'}<WellnessAdmin />
{:else if cur === 'assist'}<AssistAdmin collection={parts[1] ?? null} />
{:else if cur === 'requests'}<Requests />
{:else if cur === 'access'}<AccessAdmin />
{:else if cur === 'usage'}<UsageAdmin />
{:else if cur === 'ai'}<AiAdmin />
{:else if cur === 'tour'}<TourStats />
{:else if cur === 'audit'}<Audit />
{:else if cur}<section class="card stack"><h2>{wt('na_title')}</h2><p class="muted">{wt('na_text')}</p><div><a class="btn grad" href="#/home">{wt('na_home')}</a></div></section>{/if}
