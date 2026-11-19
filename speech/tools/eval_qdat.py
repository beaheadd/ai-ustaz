"""Замер речевого сервиса на открытом наборе obadx/qdat_bench (Apache-2.0; 159 чтецов, 5:109, разметка длин).

Только оценка, не обучение (CLAUDE.md: данные для обучения — отдельное решение).
Запуск: MUGALIM_SPEECH_MODEL_DIR=... python -I tools/eval_qdat.py [N]
Считает, насколько подсказки сервиса совпадают с экспертной разметкой:
- мунфасиль (лَنَآ إِنَّكَ): подсказка «на 2» ↔ separate_madd == 2;
- калькаля в конце (ٱلْغُيُوبِ): подсказка F1 ↔ qalqalah == 0;
- прочие замечания — для ручного просмотра (их точность меряется на записях кари и учеников).
"""
import collections, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download
from aiustaz_speech import audio
from aiustaz_speech.core import РечевоеЯдро
from aiustaz_speech.explain import разобрать
from aiustaz_speech.reference import эталон_аята

N = int(sys.argv[1]) if len(sys.argv) > 1 else 10**9
ядро = РечевоеЯдро(os.environ['MUGALIM_SPEECH_MODEL_DIR'], int(os.environ.get('MUGALIM_SPEECH_THREADS', '4')))
эталон = эталон_аята(5, 109, 7, 8)
таблица = pq.read_table(hf_hub_download('obadx/qdat_bench', 'data/train-00000-of-00001.parquet', repo_type='dataset'))
счёт = collections.Counter(); коды = collections.Counter(); время = []; длит = []
for r in таблица.slice(0, min(N, таблица.num_rows)).to_pylist():
    в, _ = audio.прочитать_запись(r['audio']['bytes'])
    if audio.оценить_звук(в):
        счёт['плохой_звук'] += 1; continue
    t0 = time.time(); р = ядро.распознать(в, эталон); з = разобрать(ядро, эталон, р); время.append(time.time() - t0); длит.append(р.длительность_сек)
    мунф = any(x['код'] == 'C1.мунфасиль' for x in з)
    счёт[('мунфасиль', мунф, r['separate_madd'] == 2)] += 1
    калк = any(x['код'] == 'F1' for x in з)
    счёт[('калькаля', калк, r['qalqalah'] == 0)] += 1
    for x in з: коды[x['код']] += 1
def точность(имя):
    tp = счёт[(имя, True, True)]; fp = счёт[(имя, True, False)]; fn = счёт[(имя, False, True)]
    return {'подсказок': tp + fp, 'верных': tp, 'ложных': fp, 'пропущено': fn,
            'точность': round(tp / (tp + fp), 3) if tp + fp else None, 'полнота': round(tp / (tp + fn), 3) if tp + fn else None}
print(json.dumps({'записей': sum(v for k, v in счёт.items() if isinstance(k, tuple) and k[0] == 'мунфасиль'),
                  'плохой_звук': счёт['плохой_звук'], 'мунфасиль_на_2': точность('мунфасиль'), 'калькаля_нет': точность('калькаля'),
                  'все_коды': dict(коды), 'сек_на_запись_ср': round(sum(время) / max(1, len(время)), 2),
                  'RTF': round(sum(время) / max(1e-9, sum(длит)), 3)}, ensure_ascii=False, indent=1))
