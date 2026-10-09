// Defense-in-depth text export; actual spreadsheet-consumer verification is pending.
export function responseCsv(responses) {
  const keys = [...new Set(responses.flatMap(r => Object.keys(r.answers)))];
  const cell = value => {
    let text = typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value);
    const normalized = text.replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trimStart();
    if (/^[=+\-@]/.test(normalized) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [['response_id', 'form_version', ...keys], ...responses.map(r => [r.id, r.version ?? '', ...keys.map(k => r.answers[k])])].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
