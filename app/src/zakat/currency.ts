/**
 * Валюты мира для калькулятора закята — чистые функции (без React, без сети). Тест — scripts/test-zakat.mjs.
 *
 * Владелец 28.11.2026 (скриншот экрана «Закят» в тенге): «Должен быть выбор валюты всего мира».
 * Контракт:
 *   ВАЛЮТЫ_ISO — действующие коды ISO 4217 (валюты людей; без драгметаллов, XDR и выведенных: BGN — евро с 2026, HRK,
 *     SLL, ZWL, CUC, ANG → XCG). Тот же список — server/rates.py ВАЛЮТЫ (pytest test_список_совпадает_с_приложением).
 *   ВАЛЮТЫ — тот же список массивом.
 *   валютаСтраны('TR') → 'TRY' | null — валюта страны места (ISO 3166-1 alpha-2) для выбора по умолчанию;
 *   валютаПоУмолчанию(страна) → валюта страны, если она в списке, иначе 'KZT';
 *   названиеВалюты('USD', 'ru-RU') → 'доллар США' (Intl.DisplayNames; нет — код);
 *   символВалюты('USD', 'ru-RU') → '$' (Intl.NumberFormat narrowSymbol; нет — код);
 *   знаковВалюты('JPY') → 0 (дробных знаков у валюты по Intl; нет — 2);
 *   форматВалюты(1234567, 'KZT', 'ru-RU') → '1 234 567 ₸' (целое — без дробной части; дробное — 2 знака: счёт идёт в
 *     сотых долях); без Intl — «1 234 567 KZT»;
 *   найтиВалюты(запрос, коды, локаль) → коды, где запрос — начало кода, часть названия или символ (без регистра).
 */

export const ВАЛЮТЫ_ISO = `
AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC
CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR
ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK
MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE
SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF
YER ZAR ZMW ZWG
`;

export const ВАЛЮТЫ: readonly string[] = ВАЛЮТЫ_ISO.trim().split(/\s+/);

/** Страна (ISO 3166-1 alpha-2) → валюта. Страны с чужой валютой (евро, доллар, франки КФА, рэнд…) — тоже здесь. */
const СТРАНЫ = `
AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AX:EUR AZ:AZN BA:BAM BB:BBD
BD:BDT BE:EUR BF:XOF BG:EUR BH:BHD BI:BIF BJ:XOF BL:EUR BM:BMD BN:BND BO:BOB BQ:USD BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN
BZ:BZD CA:CAD CC:AUD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:XCG
CX:AUD CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP EH:MAD ER:ERN ES:EUR ET:ETB FI:EUR
FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GF:EUR GG:GBP GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR
GQ:XAF GR:EUR GT:GTQ GU:USD GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IM:GBP IN:INR IO:USD
IQ:IQD IR:IRR IS:ISK IT:EUR JE:GBP JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KI:AUD KM:KMF KN:XCD KP:KPW KR:KRW KW:KWD
KY:KYD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR
MF:EUR MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MP:USD MQ:EUR MR:MRU MS:XCD MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN
MY:MYR MZ:MZN NA:NAD NC:XPF NE:XOF NF:AUD NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NR:AUD NU:NZD NZ:NZD OM:OMR PA:PAB PE:PEN
PF:XPF PG:PGK PH:PHP PK:PKR PL:PLN PM:EUR PN:NZD PR:USD PS:ILS PT:EUR PW:USD PY:PYG QA:QAR RE:EUR RO:RON RS:RSD RU:RUB
RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SH:SHP SI:EUR SJ:NOK SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP
ST:STN SV:USD SX:XCG SY:SYP SZ:SZL TC:USD TD:XAF TG:XOF TH:THB TJ:TJS TK:NZD TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD
TV:AUD TW:TWD TZ:TZS UA:UAH UG:UGX UM:USD US:USD UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VG:USD VI:USD VN:VND VU:VUV WF:XPF
WS:WST XK:EUR YE:YER YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG
`;

const ВАЛЮТА_СТРАНЫ: Record<string, string> = Object.fromEntries(
  СТРАНЫ.trim()
    .split(/\s+/)
    .map((п) => п.split(':') as [string, string]),
);

export function валютаСтраны(страна: string | null | undefined): string | null {
  return (страна && ВАЛЮТА_СТРАНЫ[страна.toUpperCase()]) || null;
}

export function валютаПоУмолчанию(страна: string | null | undefined): string {
  const в = валютаСтраны(страна);
  return в && ВАЛЮТЫ.includes(в) ? в : 'KZT';
}

export function этоВалюта(код: unknown): код is string {
  return typeof код === 'string' && ВАЛЮТЫ.includes(код);
}

/**
 * В браузерах на Chromium (Android, ПК) урезанные данные ICU: для kk и uz Intl отвечает «как у корня» — «$ 25,000» и
 * английские названия. Тогда числа kk/uz — по ru-RU (те же разряды пробелом и запятая), названия kk — по-русски, uz —
 * как отдаёт браузер (латиница). Safari и полные ICU (node) дают свои kk/uz — их и берём.
 */
const замены = new Map<string, { числа: string; названия: string }>();
function локали(локаль: string): { числа: string; названия: string } {
  let з = замены.get(локаль);
  if (!з) {
    з = { числа: локаль, названия: локаль };
    const язык = локаль.slice(0, 2);
    if (язык === 'kk' || язык === 'uz') {
      try {
        const образец = (л: string) => new Intl.NumberFormat(л, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(25000);
        // Свои данные kk/uz — разряды пробелом («25 000 $»); корневые — запятой («$ 25,000»).
        if (образец(локаль).includes('25,000')) з.числа = 'ru-RU';
        if (язык === 'kk' && typeof Intl.DisplayNames === 'function') {
          const имя = (л: string) => new Intl.DisplayNames([л], { type: 'currency' }).of('USD');
          if (имя(локаль) === имя('en')) з.названия = 'ru-RU';
        }
      } catch {
        // Intl без валют — запасной формат ниже
      }
    }
    замены.set(локаль, з);
  }
  return з;
}

const названия = new Map<string, Intl.DisplayNames | null>();

export function названиеВалюты(код: string, локаль_: string): string {
  const локаль = локали(локаль_).названия;
  if (!названия.has(локаль)) {
    try {
      названия.set(локаль, typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([локаль], { type: 'currency' }) : null);
    } catch {
      названия.set(локаль, null);
    }
  }
  try {
    return названия.get(локаль)?.of(код) ?? код;
  } catch {
    return код;
  }
}

const форматы = new Map<string, Intl.NumberFormat | null>();

function формат(код: string, локаль_: string, знаков: number | null): Intl.NumberFormat | null {
  const локаль = локали(локаль_).числа;
  const ключ = `${локаль}|${код}|${знаков}`;
  if (!форматы.has(ключ)) {
    try {
      форматы.set(
        ключ,
        new Intl.NumberFormat(локаль, {
          style: 'currency',
          currency: код,
          currencyDisplay: 'narrowSymbol',
          ...(знаков === null ? null : { minimumFractionDigits: знаков, maximumFractionDigits: знаков }),
        }),
      );
    } catch {
      форматы.set(ключ, null);
    }
  }
  return форматы.get(ключ) ?? null;
}

export function символВалюты(код: string, локаль: string): string {
  const ч = формат(код, локаль, 0)?.formatToParts(0).find((ч) => ч.type === 'currency')?.value;
  return ч || код;
}

export function знаковВалюты(код: string): number {
  const з = формат(код, 'en', null)?.resolvedOptions().maximumFractionDigits;
  return typeof з === 'number' ? з : 2;
}

/** Целая часть с разрядами пробелом — запасной формат без Intl. */
function разряды(цифры: string): string {
  return цифры.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function форматВалюты(сумма: number, код: string, локаль: string): string {
  const тиын = Math.round(Math.max(0, Number.isFinite(сумма) ? сумма : 0) * 100);
  const целое = тиын % 100 === 0;
  const знаков = целое ? 0 : 2;
  const ф = формат(код, локаль, знаков);
  if (ф) return ф.format(тиын / 100);
  const цел = разряды(String(Math.floor(тиын / 100)));
  return (целое ? цел : цел + ',' + String(тиын % 100).padStart(2, '0')) + ' ' + код;
}

/** Без регистра и диакритики: «Türk» ~ «turk». */
function норм(с: string): string {
  return с
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function найтиВалюты(запрос: string, коды: readonly string[], локаль: string): string[] {
  const з = норм(запрос);
  if (!з) return [...коды];
  return коды.filter((к) => норм(к).startsWith(з) || норм(названиеВалюты(к, локаль)).includes(з) || норм(символВалюты(к, локаль)) === з);
}
