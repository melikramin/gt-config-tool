export interface ParsedResponse {
  command: string;
  fields: string[];
  isError: boolean;
  errorCode: string | null;
}

const ERROR_CODES = new Set(['CE', 'DE', 'PE', 'FE']);

export function buildCommand(password: string, command: string, params: string[] = []): string {
  const parts = ['$' + password, command, ...params];
  return parts.join(';') + '\r\n';
}

export function parseResponse(raw: string): ParsedResponse {
  const trimmed = raw.trim();

  if (!trimmed.startsWith('$')) {
    return {
      command: '',
      fields: [trimmed],
      isError: true,
      errorCode: null,
    };
  }

  const content = trimmed.slice(1); // remove leading $
  const parts = content.split(';');
  const command = parts[0] ?? '';
  const fields = parts.slice(1);

  const lastField = fields[fields.length - 1];
  const isError = lastField !== undefined && ERROR_CODES.has(lastField);
  const errorCode = isError ? lastField : null;

  return {
    command,
    fields: isError ? fields.slice(0, -1) : fields,
    isError,
    errorCode,
  };
}
