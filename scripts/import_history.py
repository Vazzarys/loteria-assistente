"""Converte downloads oficiais XLSX em JSON, sem alterar as planilhas."""
import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

GAMES = {
    'megasena': ('Mega-Sena', 6, 1, 60),
    'lotofacil': ('Lotofácil', 15, 1, 25),
    'quina': ('Quina', 5, 1, 80),
    'lotomania': ('Lotomania', 20, 0, 99),
    'duplasena': ('Dupla Sena', 6, 1, 50),
}
# Relação das edições 2009–2025 e concurso 3100 anunciado para a edição 2026.
# Datas e dezenas sempre vêm do download oficial; não classificar por
# Observação, que pode mencionar um concurso futuro, nem só por 31/12.
VIRADA = [1140, 1245, 1350, 1455, 1560, 1665, 1775, 1890, 2000,
          2110, 2220, 2330, 2440, 2550, 2670, 2810, 2955, 3100]
VIRADA_REFERENCE = 'https://asloterias.com.br/todos-resultados-mega-da-virada'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def column_index(ref):
    value = 0
    for letter in re.match(r'[A-Z]+', ref).group():
        value = value * 26 + ord(letter) - 64
    return value - 1


def xlsx_rows(path):
    with ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(n.itertext()) for n in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        for row in sheet.findall('.//s:sheetData/s:row', NS):
            values = []
            for cell in row.findall('s:c', NS):
                index = column_index(cell.get('r')) if cell.get('r') else len(values)
                while len(values) <= index:
                    values.append('')
                node = cell.find('s:v', NS)
                value = node.text if node is not None else ''
                if cell.get('t') == 's':
                    value = strings[int(value)]
                elif cell.get('t') == 'inlineStr':
                    value = ''.join(cell.find('s:is', NS).itertext())
                values[index] = value or ''
            yield values


def convert(path, game, source_url):
    _, drawn, low, high = GAMES[game]
    rows = iter(xlsx_rows(path))
    header = [re.sub(r'\s+', ' ', h).strip().lower() for h in next(rows)]
    contest_col = header.index('concurso')
    date_col = next(i for i, h in enumerate(header) if h in ('data sorteio', 'data do sorteio'))
    ball_cols = [i for i, h in enumerate(header) if re.match(r'^bola\d+', h)]
    if len(ball_cols) != drawn * (2 if game == 'duplasena' else 1):
        raise ValueError(f'{game}: estrutura de dezenas não reconhecida')
    records = []
    for row in rows:
        if not any(row):
            continue
        contest = int(row[contest_col])
        date = datetime.strptime(row[date_col], '%d/%m/%Y').date().isoformat()
        numbers = [int(row[i]) for i in ball_cols]
        draws = [sorted(numbers[i:i + drawn]) for i in range(0, len(numbers), drawn)]
        if any(len(set(d)) != drawn or min(d) < low or max(d) > high for d in draws):
            raise ValueError(f'{game}: dezenas inválidas no concurso {contest}')
        records.append({'contest': contest, 'date': date, 'draws': draws, 'special': game == 'megasena' and contest in VIRADA})
    records.sort(key=lambda r: r['contest'])
    if not records or [r['contest'] for r in records] != list(range(1, records[-1]['contest'] + 1)):
        raise ValueError(f'{game}: concursos ausentes ou repetidos; base não será publicada')
    date_anomalies = [{'contest': b['contest'], 'previousContest': a['contest']}
                      for a, b in zip(records, records[1:]) if a['date'] > b['date']]
    if game == 'megasena' and not all(any(r['contest'] == n for r in records) for n in VIRADA if n <= records[-1]['contest']):
        raise ValueError('Relação das edições especiais não está coberta')
    return {
        'schemaVersion': 1, 'game': game,
        'importedAt': datetime.now(timezone.utc).isoformat(),
        'source': {'name': 'Download oficial Loterias Caixa', 'url': source_url,
                   'sha256': hashlib.sha256(path.read_bytes()).hexdigest()},
        'specialReference': VIRADA_REFERENCE if game == 'megasena' else None,
        'dateAnomalies': date_anomalies,
        'records': records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'data/history')
    parser.add_argument('--reuse-files', action='store_true')
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    base = 'https://servicebus3.caixa.gov.br/portaldeloterias'
    if not args.reuse_files:
        with urllib.request.urlopen('https://loterias.caixa.gov.br/Style%20Library/json/params.txt', timeout=25) as response:
            base = json.load(response)['urlapiloterias'].rstrip('/')
        if not re.match(r'^https://[a-z0-9.-]+\.caixa\.gov\.br/portaldeloterias$', base):
            raise ValueError('Host oficial não reconhecido')
    for game, (name, *_) in GAMES.items():
        source_url = base + '/api/resultados/download?modalidade=' + urllib.parse.quote(name)
        path = args.source_dir / (game + '.xlsx')
        if not args.reuse_files:
            with urllib.request.urlopen(source_url, timeout=45) as response:
                content = response.read(15_000_001)
                if not content.startswith(b'PK') or len(content) > 15_000_000:
                    raise ValueError('Download XLSX inválido')
                path.write_bytes(content)
        data = convert(path, game, source_url)
        destination = args.output_dir / (game + '.json')
        destination.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
        print(game, len(data['records']), 'concursos; último:', data['records'][-1]['contest'], 'bytes:', destination.stat().st_size)


if __name__ == '__main__':
    main()
