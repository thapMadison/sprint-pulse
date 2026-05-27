import { parseJiraCSV } from './csv.js';
import { parseJiraXML } from './xml.js';
import { parseJiraJSON } from './json.js';

export async function parseFile(file) {
  const text = await file.text();
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseJiraCSV(text);
  if (name.endsWith('.xml')) return parseJiraXML(text);
  if (name.endsWith('.json')) return parseJiraJSON(text);
  throw new Error(`Unsupported file type: ${file.name}`);
}

export { parseJiraCSV, parseJiraXML, parseJiraJSON };
