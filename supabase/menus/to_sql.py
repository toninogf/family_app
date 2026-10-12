"""Convierte un mes de menú (JSON) en SQL de carga idempotente. Uso: python3 to_sql.py 2026-10.json"""
import json, sys

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

m = json.load(open(sys.argv[1]))
rows = []
for d in m['days']:
    n = d.get('n') or [None] * 4
    rows.append('(' + ', '.join(q(x) for x in [d['day'], d.get('holiday', False), d.get('first'), d.get('second'), d.get('side'), d.get('bread'),
        d.get('dessert'), d.get('ft'), d.get('st'), d.get('dt'), *n, d.get('note'), m['source_url']]) + ')')
cols = 'day, holiday, first_course, second_course, side, bread, dessert, first_type, second_type, dessert_type, kcal, protein_g, fat_g, carbs_g, note, source_url'
upd = ', '.join(f'{c} = excluded.{c}' for c in cols.split(', ')[1:])
print(f"""insert into public.school_menu (household_id, {cols})
select h.id, v.day::date, v.holiday, v.first_course, v.second_course, v.side, v.bread, v.dessert, v.first_type, v.second_type, v.dessert_type,
       v.kcal::numeric, v.protein_g::numeric, v.fat_g::numeric, v.carbs_g::numeric, v.note, v.source_url
from (values
  {(','+chr(10)+'  ').join(rows)}
) as v({cols})
cross join (select id from public.households h where exists (select 1 from public.members m where m.household_id = h.id and m.email = 'toninogf@gmail.com')) h
on conflict (household_id, day) do update set {upd};""")
