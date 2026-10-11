import { app } from './state.svelte';

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ');
export const fmtSum = (n: number | null | undefined) => (n == null ? '—' : `${fmtMoney(n)} ${app.lang === 'uz' ? 'so‘m' : 'сум'}`);
export const fmtMln = (n: number) => `${(n / 1e6).toFixed(1).replace('.', ',')} ${app.lang === 'uz' ? 'mln' : 'млн'}`;
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_UZ = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const MONTHS_RU_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_UZ_FULL = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export const monthShort = (ym: string) => (app.lang === 'uz' ? MONTHS_UZ : MONTHS_RU)[Number(ym.slice(5, 7)) - 1];
export const monthLong = (ym: string) => `${(app.lang === 'uz' ? MONTHS_UZ_FULL : MONTHS_RU_FULL)[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const fmtTime = (iso: string) => new Intl.DateTimeFormat('ru', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtDate = (iso: string) => new Intl.DateTimeFormat(app.lang === 'uz' ? 'uz' : 'ru', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`;
export const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const nowMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()).slice(0, 7);
export const pick = <T extends Record<string, any>>(o: T, base: string) => (app.lang === 'uz' && o[`${base}_uz`]) || o[`${base}_ru`];

/** Уведомления с сервера могут начинаться с эмодзи («📅 Иван»): в интерфейсе значки линейные, поэтому эмодзи в начале убираем. */
export const stripEmoji = (t: string) => t.replace(/^[\p{Extended_Pictographic}️\s]+/u, '') || t;
