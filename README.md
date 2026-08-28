# KPI Calendar

Безкоштовний клієнтський застосунок для імпорту актуального розкладу груп КПІ з [schedule.kpi.ua](https://schedule.kpi.ua/) в окремий Google Calendar.

## Як це працює

1. Користувач обирає групу зі списку офіційного Campus API КПІ.
2. Застосунок отримує двотижневий розклад і разові дати занять.
3. Користувач надає вузький OAuth-доступ `calendar.app.created`.
4. Створюється окремий календар `Розклад <група> · КПІ`.
5. Заняття додаються компактними двотижневими повторюваними серіями замість сотень окремих запитів.
6. Повторний імпорт очищає і наповнює лише цей календар, не торкаючись інших календарів користувача.

Запити на запис проходять через контрольовану паралельну чергу зі спільним обмежувачем швидкості та автоматичним exponential backoff для тимчасових помилок `403/429`. Старий календар з окремими подіями один раз безпечно замінюється новим швидким форматом. Лекції мають синій колір, практичні — червоний, лабораторні — жовтий.

Google-токен зберігається тільки в оперативній пам’яті вкладки. Ідентифікатор створеного календаря зберігається локально в браузері для безпечного оновлення без дублювання.

## Локальний запуск

Потрібен Node.js 24.

```bash
npm ci
npm run dev
```

Статична збірка для GitHub Pages:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com npm run build:github
```

## Налаштування Google OAuth

- тип клієнта: Web application;
- authorized JavaScript origin: `https://kpi-google-calendar.github.io`;
- API: Google Calendar API;
- scope: `https://www.googleapis.com/auth/calendar.app.created`;
- GitHub Actions variable: `GOOGLE_CLIENT_ID`.

## Джерело даних

- групи: `https://api.campus.kpi.ua/group/all`;
- розклад: `https://api.campus.kpi.ua/schedule/lessons?groupId=...`;
- поточний навчальний тиждень: `https://api.campus.kpi.ua/time/current`.

Це неофіційний студентський інструмент. Перед важливими заняттями варто звірятися з [офіційним розкладом](https://schedule.kpi.ua/).

Контакти: [roman.tkachenko.vv@gmail.com](mailto:roman.tkachenko.vv@gmail.com), Telegram [@TkachenkoRV](https://t.me/TkachenkoRV).

Фонове фото: [Valentinovna, «Головний корпус КПІ (№1)»](https://commons.wikimedia.org/wiki/File:%D0%93%D0%BE%D0%BB%D0%BE%D0%B2%D0%BD%D0%B8%D0%B9_%D0%BA%D0%BE%D1%80%D0%BF%D1%83%D1%81_%D0%9A%D0%9F%D0%86_(%E2%84%961).JPG), ліцензія [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Фото кадровано й оптимізовано у WebP для вебсайту.
