"""Сверка своего расчёта времени намаза с официальными таблицами ДУМК (api.muftyat.kz).

Только для проверки (данные ДУМК в продукте — после письменного разрешения, исследование 13).
Метод ДУМК, восстановленный и подтверждённый сверкой 19.11.2026: ISNA (фаджр и иша 15°), аср ханафи,
высокие широты — TwilightAngle (AngleBased), поправки: восход −3, зухр/аср/магриб +3 мин южнее 48° с. ш.,
−5/+5 на 48° и севернее; часовой пояс UTC+5 (вся РК с 01.03.2024).
Запуск: python -I tools/prayer/compare_dumk.py   (нужен pip install adhanpy==<версия>, доступ к api.muftyat.kz)
Бережно: запросы по одному, пауза 2 с.
"""
import json, sys, time, random, urllib.request, urllib.parse, datetime as dt
S='.'

from adhanpy.PrayerTimes import PrayerTimes
from adhanpy.calculation.CalculationParameters import CalculationParameters
from adhanpy.calculation.Madhab import Madhab
from adhanpy.calculation.HighLatitudeRule import HighLatitudeRule
TZ=dt.timezone(dt.timedelta(hours=5))
def ours(lat, lng, day):
    p=CalculationParameters(fajr_angle=15, isha_angle=15)
    p.madhab=Madhab.HANAFI
    p.high_latitude_rule=HighLatitudeRule.TWILIGHT_ANGLE
    t=PrayerTimes((lat,lng), day, calculation_parameters=p, time_zone=TZ)
    off=5 if lat>=48 else 3
    r=lambda x: (x+dt.timedelta(seconds=30)).replace(second=0,microsecond=0)
    return {'fajr':r(t.fajr),'sunrise':r(t.sunrise)-dt.timedelta(minutes=off),'dhuhr':r(t.dhuhr)+dt.timedelta(minutes=off),
            'asr':r(t.asr)+dt.timedelta(minutes=off),'maghrib':r(t.maghrib)+dt.timedelta(minutes=off),'isha':r(t.isha)}

names=['Шымкент','Түркістан','Тараз','Қызылорда','Ақтау','Атырау','Ақтөбе','Орал','Қостанай','Көкшетау','Павлодар','Семей','Өскемен','Зайсаң','Талдықорған','Жезқазған','Қарағанды','Балқаш','Арал','Жаркент','Риддер','Екібастұз','Сарыағаш','Байқоңыр','Петропавл']
def get(u):
    req=urllib.request.Request(u,headers={'User-Agent':'aiustaz-check/1.0'})
    with urllib.request.urlopen(req,timeout=40) as r: return json.load(r)
res=[]
for n in names:
    try:
        c=get('https://api.muftyat.kz/cities/?search='+urllib.parse.quote(n))['results']
        c=[x for x in c if x['title'].startswith(n) and ('қала' in x['title'] or x['district'] is None)] or c
        if not c: print('нет',n); continue
        x=c[0]; lat,lng=float(x['lat']),float(x['lng'])
        rows=get(f'https://api.muftyat.kz/prayer-times/2026/{x["lat"]}/{x["lng"]}')['result']
    except Exception as e:
        print('ошибка',n,e); time.sleep(3); continue
    worst={}; within={}; exact={}
    for row in rows:
        day=dt.date.fromisoformat(row['Date']); o=ours(lat,lng,day)
        for k in o:
            h,m=map(int,row[k].split(':')); ref=dt.datetime(day.year,day.month,day.day,h,m,tzinfo=TZ)
            diff=round((o[k].astimezone(TZ)-ref).total_seconds()/60)
            worst[k]=max(worst.get(k,0),abs(diff)); within[k]=within.get(k,0)+(abs(diff)<=1); exact[k]=exact.get(k,0)+(diff==0)
    tot=6*len(rows)
    res.append((x['title'],lat,lng,max(worst.values()),sum(within.values())/tot,sum(exact.values())/tot,worst))
    print(f"{x['title'][:22]:22} {lat:6.2f} {lng:6.2f} макс {max(worst.values())} мин | ≤1 мин {sum(within.values())/tot:.4f} | точно {sum(exact.values())/tot:.3f}", flush=True)
    time.sleep(2)

