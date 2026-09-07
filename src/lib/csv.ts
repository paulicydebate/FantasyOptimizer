import Papa from 'papaparse';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data,
        });
      },
      error: (error: Error) => reject(error),
    });
  });
}

function guessColumn(headers: string[], candidates: string[]): string {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h === candidate);
    if (idx !== -1) return headers[idx];
  }
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return headers[idx];
  }
  return '';
}

export function guessMapping(headers: string[]) {
  return {
    name: guessColumn(headers, ['name', 'player', 'player name']),
    position: guessColumn(headers, ['position', 'pos']),
    cost: guessColumn(headers, ['cost', 'price', 'salary', 'auction value', 'value', 'avg cost']),
    points: guessColumn(headers, ['points', 'projected points', 'projection', 'proj', 'pts']),
    team: guessColumn(headers, ['team', 'tm']) || null,
  };
}
