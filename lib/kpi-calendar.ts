export const KPI_API = 'https://api.campus.kpi.ua';
export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const KYIV_TIME_ZONE = 'Europe/Kyiv';

export type Group = {
  id: number;
  name: string;
  faculty: string;
};

type Pair = {
  name: string;
  type: string;
  tag: string;
  time: string;
  dates: string[];
  lecturer?: { id: string; name: string } | null;
  location?: { uri?: string; title?: string } | null;
};

type ScheduleDay = { day: string; pairs: Pair[] };

export type StudentSchedule = {
  groupCode: string;
  scheduleFirstWeek: ScheduleDay[];
  scheduleSecondWeek: ScheduleDay[];
};

export type CurrentTime = {
  currentWeek: 1 | 2;
  currentDay: number;
  currentLesson: number;
};

export type CalendarEvent = {
  summary: string;
  description: string;
  colorId?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: { useDefault: boolean };
  extendedProperties: { private: { source: string; groupId: string } };
};

const DAY_INDEX: Record<string, number> = {
  Пн: 1,
  Вт: 2,
  Вв: 2,
  Ср: 3,
  Чт: 4,
  Пт: 5,
  Сб: 6,
};

const EVENT_COLOR_BY_TAG: Record<string, string> = {
  lec: '9',
  prac: '11',
  lab: '5',
};

const GOOGLE_MAX_ATTEMPTS = 8;
const GOOGLE_MAX_BACKOFF_MS = 32_000;
const GOOGLE_WRITE_DELAY_MS = 250;
const RETRYABLE_GOOGLE_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'backendError',
]);

const pad = (value: number) => String(value).padStart(2, '0');

export const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function getDefaultDateRange(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (month <= 0) {
    return { start: `${year}-01-01`, end: `${year}-01-31` };
  }
  if (month <= 5) {
    return { start: `${year}-02-01`, end: `${year}-06-30` };
  }
  return { start: `${year}-09-01`, end: `${year}-12-31` };
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function mondayOf(date: Date) {
  const copy = new Date(date);
  const weekday = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - weekday + 1);
  return copy;
}

function addMinutes(date: string, time: string, minutes: number) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes, second));
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function eventColor(pair: Pair) {
  const taggedColor = EVENT_COLOR_BY_TAG[pair.tag.toLowerCase()];
  if (taggedColor) return taggedColor;

  const type = pair.type.toLocaleLowerCase('uk-UA');
  if (type.includes('лек')) return '9';
  if (type.includes('прак')) return '11';
  if (type.includes('лаб')) return '5';
  return undefined;
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

function paceGoogleWrite() {
  return wait(GOOGLE_WRITE_DELAY_MS + Math.floor(Math.random() * 150));
}

function weekForDate(date: Date, anchorDate: Date, anchorWeek: 1 | 2): 1 | 2 {
  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  const distance = Math.round((mondayOf(date).getTime() - mondayOf(anchorDate).getTime()) / millisecondsPerWeek);
  const parity = ((distance % 2) + 2) % 2;
  return parity === 0 ? anchorWeek : anchorWeek === 1 ? 2 : 1;
}

function pairToEvent(pair: Pair, date: string, group: Group): CalendarEvent {
  const colorId = eventColor(pair);
  const details = [
    pair.type ? `Тип: ${pair.type}` : '',
    pair.lecturer?.name ? `Викладач: ${pair.lecturer.name}` : '',
    `Група: ${group.name}`,
    pair.location?.uri ? `Місце: ${pair.location.uri}` : '',
    '',
    'Джерело: https://schedule.kpi.ua/',
  ].filter(Boolean);

  return {
    summary: `${pair.name}${pair.type ? ` · ${pair.type}` : ''}`,
    description: details.join('\n'),
    ...(colorId ? { colorId } : {}),
    ...(pair.location?.title ? { location: pair.location.title } : {}),
    start: {
      dateTime: `${date}T${pair.time}`,
      timeZone: KYIV_TIME_ZONE,
    },
    end: {
      dateTime: addMinutes(date, pair.time, 95),
      timeZone: KYIV_TIME_ZONE,
    },
    reminders: { useDefault: true },
    extendedProperties: {
      private: { source: 'kpi-google-calendar', groupId: String(group.id) },
    },
  };
}

export function buildCalendarEvents(
  schedule: StudentSchedule,
  group: Group,
  startDate: string,
  endDate: string,
  currentTime: CurrentTime,
  anchor = new Date(),
) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const anchorUtc = new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()));
  const events: CalendarEvent[] = [];
  const seen = new Set<string>();

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0) continue;

    const week = weekForDate(cursor, anchorUtc, currentTime.currentWeek);
    const weekSchedule = week === 1 ? schedule.scheduleFirstWeek : schedule.scheduleSecondWeek;
    const row = weekSchedule.find((item) => DAY_INDEX[item.day] === weekday);
    if (!row) continue;

    const date = dateKey(cursor);
    for (const pair of row.pairs) {
      if (pair.dates.length > 0 && !pair.dates.includes(date)) continue;
      const signature = [date, pair.time, pair.name, pair.type, pair.lecturer?.name, pair.location?.title].join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);
      events.push(pairToEvent(pair, date, group));
    }
  }

  return events.sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime));
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Сервіс повернув помилку ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function googleRequest<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  type GoogleErrorPayload = {
    error?: {
      message?: string;
      errors?: { reason?: string }[];
    };
  };

  for (let attempt = 0; attempt < GOOGLE_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    }

    const payload = await response.json().catch(() => null) as GoogleErrorPayload | null;
    const reasons = payload?.error?.errors?.map((item) => item.reason).filter(Boolean) || [];
    const message = payload?.error?.message?.toLocaleLowerCase('en-US') || '';
    const rateLimitMessage = message.includes('rate limit') || message.includes('usage limits');
    const retryable = response.status === 429
      || response.status >= 500
      || (response.status === 403 && (
        rateLimitMessage
        || reasons.some((reason) => RETRYABLE_GOOGLE_REASONS.has(reason as string))
      ));

    if (retryable && attempt < GOOGLE_MAX_ATTEMPTS - 1) {
      const retryAfter = retryAfterMilliseconds(response.headers.get('Retry-After'));
      const exponential = Math.min(2 ** attempt * 1_000, GOOGLE_MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * 1_000);
      await wait(retryAfter ?? exponential + jitter);
      continue;
    }

    if (retryable) {
      throw new Error('Google Calendar тимчасово обмежує швидкість запитів. Зачекайте хвилину та повторіть імпорт — календар буде оновлено без дублювань.');
    }

    throw new Error(payload?.error?.message || `Google Calendar повернув помилку ${response.status}.`);
  }

  throw new Error('Не вдалося завершити запит до Google Calendar. Спробуйте ще раз трохи пізніше.');
}

async function mapWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

export async function importIntoGoogleCalendar(
  accessToken: string,
  group: Group,
  events: CalendarEvent[],
  onProgress: (completed: number, total: number) => void,
) {
  const storageKey = `kpi-calendar:${group.id}`;
  let calendarId = localStorage.getItem(storageKey);

  if (calendarId) {
    try {
      await googleRequest(accessToken, `/calendars/${encodeURIComponent(calendarId)}`);
    } catch {
      calendarId = null;
      localStorage.removeItem(storageKey);
    }
  }

  if (!calendarId) {
    const calendar = await googleRequest<{ id: string }>(accessToken, '/calendars', {
      method: 'POST',
      body: JSON.stringify({
        summary: `Розклад ${group.name} · КПІ`,
        description: `Розклад групи ${group.name}, імпортований із schedule.kpi.ua`,
        timeZone: KYIV_TIME_ZONE,
      }),
    });
    calendarId = calendar.id;
    localStorage.setItem(storageKey, calendarId);
  }

  const existing = await googleRequest<{ items?: { id: string }[] }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=2500&showDeleted=false`,
  );
  await mapWithConcurrency(existing.items || [], 1, async (event) => {
    await googleRequest(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' });
    await paceGoogleWrite();
  });

  let completed = 0;
  onProgress(0, events.length);
  await mapWithConcurrency(events, 1, async (event) => {
    await googleRequest(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
    completed += 1;
    onProgress(completed, events.length);
    await paceGoogleWrite();
  });

  return calendarId;
}
