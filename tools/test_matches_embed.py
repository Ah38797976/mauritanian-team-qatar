# حارس: لا يجوز جلب match_events مباشرة من matches (لا علاقة بينهما في القاعدة → 400)؛ يجب تضمينها داخل match_players.
import pathlib, re, sys
src = (pathlib.Path(__file__).resolve().parent.parent / 'admin/live/live-adapter.js').read_text(encoding='utf-8')
sel = re.search(r"q\('matches'\)\.select\('([^']+)'\)", src).group(1)
ok = 'match_players(player_id,match_events(' in sel and '),match_events(' not in sel
print(('PASS' if ok else 'FAIL'), sel); sys.exit(0 if ok else 1)
