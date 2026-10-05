<script lang="ts">
  import { api } from '../lib/api';
  import { fmtDateTime } from '../lib/format';
  let items: any[] = $state([]), action = $state('');
  const load = () => api.get(`/api/admin/audit?limit=200${action ? `&action=${action}` : ''}`).then((r) => (items = r.items));
  load();
</script>
<div class="row" style="margin-bottom:14px"><select bind:value={action} onchange={load} style="max-width:260px"><option value="">Все действия</option>
  {#each ['login', 'login_failed', 'access_denied', 'payroll_view', 'payroll_publish', 'photo_view', 'photos_deleted', 'assist_publish', 'user_create', 'password_reset'] as a}<option>{a}</option>{/each}</select></div>
<div class="card scroll-x" style="padding:12px 16px"><table class="table"><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Объект</th><th>IP</th></tr></thead>
  <tbody>{#each items as a}<tr><td class="small">{fmtDateTime(a.at)}</td><td>{a.user_name ?? '—'}</td><td><b>{a.action}</b></td><td class="small">{a.target ?? ''}</td><td class="xs muted">{a.ip}</td></tr>{/each}</tbody></table></div>
