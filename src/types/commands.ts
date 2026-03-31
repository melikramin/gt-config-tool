export interface ParsedResponse {
  command: string;
  fields: string[];
  isError: boolean;
  errorCode: string | null;
}

export type ResponseCode = 'OK' | 'CE' | 'DE' | 'PE' | 'FE';
