import { Temporal } from "@js-temporal/polyfill";

const jst = "Asia/Tokyo";

const pad = (value: number): string => String(value).padStart(2, "0");

// A datetime-local value is a JST wall clock. Missing time is 00:00.
export const jstLocalPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

export const instantFromJstLocal = (local: string): string => {
  const match = jstLocalPattern.exec(local);
  if (match === null) {
    throw new Error("公開日時は JST の日時です。");
  }

  const [, year, month, day, hour, minute] = match;
  const zoned = Temporal.ZonedDateTime.from({
    timeZone: jst,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: 0,
    millisecond: 0,
  });
  return zoned.toInstant().toString();
};

export const jstLocalFromInstant = (instant: string): string => {
  const zoned = Temporal.Instant.from(instant).toZonedDateTimeISO(jst);
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`;
};

export const formatJst = (instant: string): string => {
  const zoned = Temporal.Instant.from(instant).toZonedDateTimeISO(jst);
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)} ${pad(zoned.hour)}:${pad(zoned.minute)} JST`;
};

export const nowInstant = (): string => Temporal.Now.instant().toString();

export const todayAtMidnightJst = (): string => {
  const today = Temporal.Now.zonedDateTimeISO(jst).toPlainDate();
  return `${today.toString()}T00:00`;
};
