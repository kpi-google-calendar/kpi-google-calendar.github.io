# KPI Calendar

Безкоштовний клієнтський застосунок для імпорту актуального розкладу груп КПІ з [schedule.kpi.ua](https://schedule.kpi.ua/) в окремий Google Calendar.

## Як це працює

1. Користувач обирає групу зі списку офіційного Campus API КПІ.
2. Застосунок отримує двотижневий розклад і разові дати занять.
3. Користувач надає вузький OAuth-доступ `calendar.app.created`.
4. Створюється окремий календар `Розклад <група> · КПІ`.
5. Повторний імпорт очищає і наповнює лише цей календар, не торкаючись інших календарів користувача.

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
