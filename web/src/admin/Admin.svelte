<script lang="ts">
  import { has } from '../lib/state.svelte';
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

  let { parts }: { parts: string[] } = $props();
  const tabs = $derived([
    has('hr') && { id: 'users', l: 'Сотрудники' },
    has('accountant') && { id: 'payroll', l: 'Зарплата и KPI' },
    has('admin') && { id: 'attendance', l: 'Приход' },
    has('editor', 'hr') && { id: 'kb', l: 'База знаний' },
    has('hr') && { id: 'growth', l: 'Модель роста' },
    has('hr', 'editor', 'head') && { id: 'training', l: 'Обучение' },
    has('hr') && { id: 'wellness', l: 'Напоминания' },
    has('editor') && { id: 'assist', l: 'Помощник оператора' },
    has('hr', 'accountant') && { id: 'requests', l: 'Заявки' },
    has('admin') && { id: 'ai', l: 'ИИ' },
    has('admin') && { id: 'tour', l: 'Обучение порталу' },
    has('admin') && { id: 'audit', l: 'Журнал' },
  ].filter(Boolean) as { id: string; l: string }[]);
  const cur = $derived(parts[0] ?? tabs[0]?.id);
</script>

<header class="page-head"><div><h1>Админка</h1></div></header>
<nav class="tabs">{#each tabs as tb}<a href="#/admin/{tb.id}" class:on={cur === tb.id}>{tb.l}</a>{/each}</nav>

{#if cur === 'users'}<Users />
{:else if cur === 'payroll'}<PayrollAdmin />
{:else if cur === 'attendance'}<AttendanceAdmin />
{:else if cur === 'kb'}<KbAdmin />
{:else if cur === 'growth'}<GrowthAdmin />
{:else if cur === 'training'}<TrainingAdmin />
{:else if cur === 'wellness'}<WellnessAdmin />
{:else if cur === 'assist'}<AssistAdmin collection={parts[1] ?? null} />
{:else if cur === 'requests'}<Requests />
{:else if cur === 'ai'}<AiAdmin />
{:else if cur === 'tour'}<TourStats />
{:else if cur === 'audit'}<Audit />
{:else}<p class="muted">Нет доступных разделов</p>{/if}
