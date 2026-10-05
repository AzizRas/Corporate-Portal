<script lang="ts">
  import qrcode from 'qrcode-generator';
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';

  let data: any = $state(null), depts: any[] = $state([]), msg = $state(''), qrFor: any = $state(null), token = $state(''), ttl = $state(0), qrSvg = $state(''), ips = $state('');
  const load = () => api.get('/api/admin/attendance').then((r) => { data = r; ips = r.wifi_ips.join('\n'); });
  load(); api.get('/api/departments').then((r) => (depts = r.departments));

  const rows = $derived.by(() => {
    if (!data) return [];
    const by = new Map<number | null, any>(data.settings.map((s: any) => [s.dept_id, s]));
    const mk = (id: number | null) => by.get(id) ?? { dept_id: id, geo: true, selfie: false, qr: false, wifi: false, grace_min: 10, photo_days: 30, _own: false };
    return [{ ...mk(null), label: 'Весь портал (по умолчанию)', _own: true }, ...depts.map((d) => ({ ...mk(d.id), label: d.name_ru, _own: by.has(d.id) }))];
  });
  async function save(r: any) { await api.put('/api/admin/attendance/settings', r); msg = 'Сохранено'; await load(); setTimeout(() => (msg = ''), 2000); }
  async function resetDept(r: any) { await api.del(`/api/admin/attendance/settings/${r.dept_id}`); await load(); }

  let np = $state({ name: '', lat: '', lng: '', radius_m: 150 });
  async function addPoint() { await api.post('/api/admin/attendance/points', { name: np.name, lat: np.lat ? Number(np.lat) : null, lng: np.lng ? Number(np.lng) : null, radius_m: np.radius_m }); np = { name: '', lat: '', lng: '', radius_m: 150 }; await load(); }
  async function patchPoint(p: any, body: any) { await api.patch(`/api/admin/attendance/points/${p.id}`, body); await load(); }
  const here = (p: any) => navigator.geolocation.getCurrentPosition((x) => patchPoint(p, { lat: x.coords.latitude, lng: x.coords.longitude }));
  async function saveIps() { await api.put('/api/admin/attendance/wifi', { ips: ips.split('\n').map((x) => x.trim()).filter(Boolean) }); msg = 'Сохранено'; }

  let timer: any;
  async function refreshQr() {
    const r = await api.get(`/api/attendance/qr/${qrFor.id}`); token = r.token; ttl = r.ttl;
    const q = qrcode(0, 'M'); q.addData(r.token); q.make(); qrSvg = q.createSvgTag({ scalable: true, margin: 2 });
    timer = setTimeout(refreshQr, Math.max(r.ttl, 2) * 1000);
  }
  const openQr = (p: any) => { qrFor = p; refreshQr(); };
  const closeQr = () => { clearTimeout(timer); qrFor = null; };
</script>

{#if data}
  <div class="card scroll-x" style="padding:16px 20px">
    <div class="card-head"><h3>Способы проверки по отделам</h3>{#if msg}<span class="pill-ok">{msg}</span>{/if}</div>
    <p class="muted small" style="margin-bottom:12px">Если способ выключен, в интерфейсе нет соответствующего запроса (например, камеры). Строка отдела переопределяет настройки портала.</p>
    <table class="table"><thead><tr><th>Отдел</th><th>Геолокация</th><th>Селфи</th><th>QR</th><th>Wi-Fi</th><th>Допуск, мин</th><th>Хранение фото, дн.</th><th></th></tr></thead>
      <tbody>{#each rows as r}
        <tr><td><b>{r.label}</b>{#if r.dept_id && !r._own}<div class="muted xs">наследует общие</div>{/if}</td>
          {#each ['geo', 'selfie', 'qr', 'wifi'] as k}<td><input type="checkbox" bind:checked={r[k]} style="width:18px;height:18px;accent-color:var(--accent)" /></td>{/each}
          <td><input type="number" bind:value={r.grace_min} style="width:80px" /></td><td><input type="number" bind:value={r.photo_days} style="width:90px" /></td>
          <td class="row"><button class="btn sm grad" onclick={() => save(r)}>Сохранить</button>{#if r.dept_id && r._own}<button class="btn sm" onclick={() => resetDept(r)}>Сбросить</button>{/if}</td></tr>
      {/each}</tbody></table>
  </div>

  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(360px,1fr));margin-top:24px">
    <section class="card">
      <div class="card-head"><h3>Точки (офис, склад)</h3></div>
      <div class="list">
        {#each data.points as p}
          <div style="align-items:flex-start"><span><b>{p.name}</b><div class="muted xs">{p.lat?.toFixed(5) ?? '—'}, {p.lng?.toFixed(5) ?? '—'} · радиус {p.radius_m} м {p.active ? '' : '· выключена'}</div></span>
            <span class="row wrap"><button class="btn sm" onclick={() => here(p)}>Я здесь</button><button class="btn sm" onclick={() => openQr(p)}>QR-экран</button><button class="btn sm" onclick={() => patchPoint(p, { active: !p.active })}>{p.active ? 'Выкл' : 'Вкл'}</button></span></div>
        {/each}
      </div>
      <h3 class="card-title" style="margin:18px 0 8px">Новая точка</h3>
      <div class="stack"><input placeholder="Название" bind:value={np.name} /><div class="row"><input placeholder="Широта" bind:value={np.lat} /><input placeholder="Долгота" bind:value={np.lng} /><input type="number" bind:value={np.radius_m} style="width:100px" /></div><button class="btn grad" onclick={addPoint} disabled={!np.name}>Добавить</button></div>
    </section>
    <section class="card stack">
      <div class="card-head"><h3>IP-адреса офисного Wi-Fi</h3></div>
      <p class="muted small">Способ «Wi-Fi» засчитывает отметку, только если запрос идёт с одного из этих внешних IP (по одному в строке).</p>
      <textarea bind:value={ips}></textarea><button class="btn grad" onclick={saveIps}>Сохранить</button>
    </section>
  </div>
{/if}

{#if qrFor}
  <Modal onclose={closeQr}>
    <h2>{qrFor.name}: код входа</h2>
    <div style="background:#fff;border-radius:20px;padding:12px;max-width:340px;margin:0 auto">{@html qrSvg}</div>
    <p style="text-align:center;font-size:34px;font-weight:800;letter-spacing:.12em;margin:14px 0">{token}</p>
    <p class="muted small" style="text-align:center">Код меняется каждую минуту. Откройте эту страницу на планшете у входа.</p>
  </Modal>
{/if}
