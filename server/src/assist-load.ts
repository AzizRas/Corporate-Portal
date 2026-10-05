// Полная перезагрузка контента помощника из assist/seed.json (рабочая копия заменяется, создаётся новый выпуск).
// Для случая, когда выпущена новая версия исходного HTML: npm run assist:import <файл.html> && npm run assist:load
import { migrate } from './migrate.js';
import { pool } from './db.js';
import { seedAssist } from './modules/assist.js';

migrate(false)
  .then(() => seedAssist(true))
  .then((ok) => console.log(ok ? 'Контент загружен, создан новый выпуск' : 'assist/seed.json не найден'))
  .then(() => pool.end())
  .catch((e) => { console.error(e); process.exit(1); });
