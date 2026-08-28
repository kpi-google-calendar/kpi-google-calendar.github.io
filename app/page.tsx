'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  CircleAlert,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  buildCalendarEvents,
  CurrentTime,
  fetchJson,
  getDefaultDateRange,
  GOOGLE_SCOPE,
  Group,
  importIntoGoogleCalendar,
  KPI_API,
  StudentSchedule,
} from '@/lib/kpi-calendar';

type Phase = 'group' | 'review' | 'authorizing' | 'importing' | 'done';
type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

const steps = [
  ['01', 'Оберіть групу', 'Знайдемо актуальний розклад у сервісі КПІ'],
  ['02', 'Увійдіть у Google', 'Доступ лише до календаря, створеного цим застосунком'],
  ['03', 'Готово', 'Заняття з’являться в окремому календарі'],
];

const normalizeGroup = (value: string) => value.trim().replace(/[–—]/g, '-').toLocaleUpperCase('uk-UA');
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export default function Home() {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [schedule, setSchedule] = useState<StudentSchedule | null>(null);
  const [currentTime, setCurrentTime] = useState<CurrentTime | null>(null);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [phase, setPhase] = useState<Phase>('group');
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [calendarId, setCalendarId] = useState('');

  useEffect(() => {
    fetchJson<Group[]>(`${KPI_API}/group/all`)
      .then((items) => setGroups(items.sort((a, b) => a.name.localeCompare(b.name, 'uk'))))
      .catch(() => setError('Не вдалося завантажити список груп. Перевірте з’єднання та спробуйте ще раз.'))
      .finally(() => setLoadingGroups(false));
  }, []);

  useEffect(() => {
    if (window.google) {
      setGoogleReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', () => setGoogleReady(true), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.addEventListener('load', () => setGoogleReady(true), { once: true });
    document.head.appendChild(script);
  }, []);

  const exactGroup = useMemo(() => {
    const normalized = normalizeGroup(query);
    return groups.find((group) => normalizeGroup(group.name) === normalized) || null;
  }, [groups, query]);

  const calendarEvents = useMemo(() => {
    if (!schedule || !selectedGroup || !currentTime || !startDate || !endDate || startDate > endDate) return [];
    return buildCalendarEvents(schedule, selectedGroup, startDate, endDate, currentTime);
  }, [schedule, selectedGroup, currentTime, startDate, endDate]);

  const step = phase === 'group' ? 1 : phase === 'done' ? 3 : 2;

  async function handleFindSchedule() {
    const group = exactGroup;
    if (!group) {
      setError('Оберіть точну назву групи зі списку під полем пошуку.');
      return;
    }

    setError('');
    setLoadingSchedule(true);
    try {
      const [nextSchedule, nextCurrentTime] = await Promise.all([
        fetchJson<StudentSchedule>(`${KPI_API}/schedule/lessons?groupId=${group.id}`),
        fetchJson<CurrentTime>(`${KPI_API}/time/current`),
      ]);
      setSelectedGroup(group);
      setSchedule(nextSchedule);
      setCurrentTime(nextCurrentTime);
      setPhase('review');
    } catch {
      setError('Не вдалося отримати розклад цієї групи. Спробуйте трохи пізніше.');
    } finally {
      setLoadingSchedule(false);
    }
  }

  function resetToGroup() {
    setPhase('group');
    setError('');
    setProgress({ completed: 0, total: 0 });
  }

  function handleAuthorize() {
    if (!CLIENT_ID) {
      setError('Google OAuth ще не налаштовано для цієї адреси сайту.');
      return;
    }
    if (!window.google || !googleReady) {
      setError('Сервіс входу Google ще завантажується. Зачекайте кілька секунд і повторіть.');
      return;
    }
    if (!selectedGroup || calendarEvents.length === 0) {
      setError('У вибраному періоді немає занять для імпорту. Перевірте дати.');
      return;
    }

    setError('');
    setPhase('authorizing');
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: async (response) => {
        if (!response.access_token) {
          setPhase('review');
          setError(response.error_description || 'Google не надав доступ до календаря.');
          return;
        }

        setPhase('importing');
        try {
          const id = await importIntoGoogleCalendar(
            response.access_token,
            selectedGroup,
            calendarEvents,
            (completed, total) => setProgress({ completed, total }),
          );
          setCalendarId(id);
          setPhase('done');
        } catch (importError) {
          setPhase('review');
          setError(importError instanceof Error ? importError.message : 'Не вдалося завершити імпорт.');
        }
      },
      error_callback: () => {
        setPhase('review');
        setError('Вікно входу Google було закрито або заблоковано браузером.');
      },
    });
    client.requestAccessToken({ prompt: '' });
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <a href="#top" className="flex items-center gap-3" aria-label="KPI Calendar — на початок">
          <span className="logo-mark"><CalendarDays /></span>
          <span>
            <span className="block text-sm font-bold tracking-[-0.02em]">KPI Calendar</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">розклад без ручної роботи</span>
          </span>
        </a>
        <a className="header-link" href="https://schedule.kpi.ua/" target="_blank" rel="noreferrer">
          schedule.kpi.ua <ExternalLink className="size-3.5" />
        </a>
      </header>

      <section id="top" className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:items-center lg:px-10 lg:pb-24 lg:pt-16">
        <div className="max-w-2xl">
          <div className="eyebrow"><Sparkles className="size-3.5" /> Безкоштовно · без реєстрації</div>
          <h1 className="mt-6 text-balance text-[clamp(2.75rem,7vw,5.8rem)] font-black leading-[0.92] tracking-[-0.065em]">
            Розклад КПІ<br /><span className="text-gradient">у Google Calendar.</span>
          </h1>
          <p className="mt-7 max-w-xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
            Введіть групу один раз. Пари, аудиторії та викладачі з’являться в окремому календарі — акуратно й без дублювань.
          </p>

          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {[
              [ShieldCheck, 'Мінімальний доступ'],
              [LockKeyhole, 'Токен не зберігається'],
              [GraduationCap, 'Дані з API КПІ'],
            ].map(([Icon, label]) => (
              <div className="trust-chip" key={label as string}>
                <Icon className="size-4 text-primary" />
                <span>{label as string}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="import-card" aria-live="polite">
          <div className="card-topline">
            <span className="flex items-center gap-2"><span className="status-dot" /> Імпорт розкладу</span>
            <span className="text-muted-foreground">{step} / 3</span>
          </div>

          {phase === 'group' && (
            <div className="p-5 sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Крок 1</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em]">Яка у вас група?</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Почніть вводити назву — наприклад, ІП-61.</p>
                </div>
                <span className="step-icon"><Search /></span>
              </div>

              <label className="mb-2 block text-sm font-semibold" htmlFor="group-search">Група</label>
              <div className="relative">
                {loadingGroups ? <LoaderCircle className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" /> : <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />}
                <Input
                  id="group-search"
                  list="kpi-groups"
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setError(''); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') void handleFindSchedule(); }}
                  placeholder={loadingGroups ? 'Завантажуємо групи…' : 'Введіть назву групи'}
                  autoComplete="off"
                  disabled={loadingGroups}
                  className="h-14 rounded-xl border-white/10 bg-white/[0.055] pl-11 pr-4 text-base shadow-inner placeholder:text-slate-500 focus-visible:border-primary/70"
                />
                <datalist id="kpi-groups">
                  {groups.map((group) => <option key={group.id} value={group.name}>{group.faculty}</option>)}
                </datalist>
              </div>
              {exactGroup ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><Check className="size-3.5" /> {exactGroup.faculty} · групу знайдено</p>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Check className="size-3.5 text-emerald-400" /> Підключено до актуального розкладу КПІ</p>
              )}

              {error && <ErrorMessage message={error} />}
              <Button className="mt-7 h-13 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-[0_12px_34px_-12px_var(--primary)] hover:bg-primary/90" disabled={!exactGroup || loadingSchedule} onClick={() => void handleFindSchedule()}>
                {loadingSchedule ? <><LoaderCircle className="animate-spin" /> Завантажуємо розклад</> : <>Знайти розклад <ArrowRight data-icon="inline-end" className="ml-1" /></>}
              </Button>
            </div>
          )}

          {(phase === 'review' || phase === 'authorizing' || phase === 'importing') && selectedGroup && (
            <div className="p-5 sm:p-7">
              <button type="button" className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground" onClick={resetToGroup} disabled={phase !== 'review'}>
                <ArrowLeft className="size-3.5" /> Змінити групу
              </button>
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Крок 2</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em]">{selectedGroup.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedGroup.faculty} · {calendarEvents.length} подій</p>
                </div>
                <span className="step-icon"><CalendarCheck /></span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <label className="date-field">Початок<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={phase !== 'review'} /></label>
                <label className="date-field">Кінець<Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={phase !== 'review'} /></label>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Період можна змінити. Нерегулярні заняття додаються лише на дати, указані в розкладі КПІ.</p>

              <div className="mt-5 rounded-xl border border-white/8 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-4 text-xs"><span className="font-semibold">Окремий календар</span><span className="text-primary">Розклад {selectedGroup.name} · КПІ</span></div>
                <div className="mt-3 h-px bg-white/8" />
                <p className="mt-3 text-xs leading-5 text-muted-foreground">Доступ поширюється лише на календарі, створені цим застосунком. Інші події Google Calendar недоступні.</p>
              </div>

              {phase === 'importing' && (
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs font-semibold"><span>Додаємо заняття…</span><span>{progress.completed} / {progress.total}</span></div>
                  <div className="progress-track"><span style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} /></div>
                </div>
              )}
              {phase === 'authorizing' && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-primary" /> Очікуємо підтвердження Google…</p>}
              {error && <ErrorMessage message={error} />}
              <Button className="mt-6 h-13 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-[0_12px_34px_-12px_var(--primary)] hover:bg-primary/90" disabled={phase !== 'review' || calendarEvents.length === 0 || startDate > endDate} onClick={handleAuthorize}>
                {phase === 'review' ? <>Увійти в Google та імпортувати <ArrowRight className="ml-1" /></> : <><LoaderCircle className="animate-spin" /> Виконуємо імпорт</>}
              </Button>
            </div>
          )}

          {phase === 'done' && selectedGroup && (
            <div className="p-5 text-center sm:p-8">
              <span className="success-icon"><Check /></span>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Імпорт завершено</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em]">{progress.completed} занять у календарі</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Створено окремий календар «Розклад {selectedGroup.name} · КПІ». Його можна вимкнути або видалити в Google Calendar.</p>
              <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer" className="mt-7 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground transition hover:bg-primary/90">
                Відкрити Google Calendar <ExternalLink className="size-4" />
              </a>
              <button type="button" onClick={() => { setPhase('review'); setError(''); }} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <RefreshCw className="size-3.5" /> Оновити цей календар
              </button>
              <span className="sr-only">{calendarId}</span>
            </div>
          )}

          <div className="calendar-strip" aria-hidden="true">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт'].map((day, index) => (
              <div key={day} className={index === 2 ? 'is-active' : ''}>
                <span>{day}</span><strong>{index + 7}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-white/[0.075] bg-black/10">
        <div className="mx-auto grid w-full max-w-7xl gap-px px-5 py-10 sm:px-8 md:grid-cols-3 lg:px-10">
          {steps.map(([number, title, description], index) => (
            <article className="how-step" key={number}>
              <div className="flex items-center gap-3"><span className="step-number">{number}</span>{index < 2 && <span className="hidden h-px flex-1 bg-white/10 md:block" />}</div>
              <h3 className="mt-5 text-base font-bold">{title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <p>Неофіційний інструмент для студентів КПІ ім. Ігоря Сікорського.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href="/privacy/" className="hover:text-foreground">Приватність</a>
          <a href="/terms/" className="hover:text-foreground">Умови</a>
          <a href="https://github.com/kpi-google-calendar/kpi-google-calendar.github.io" target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a>
        </div>
      </footer>
    </main>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return <p className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/8 p-3 text-xs leading-5 text-rose-200"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {message}</p>;
}
