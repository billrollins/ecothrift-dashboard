import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import api from '../api/client';
import { apiErrorMessage, serverErrorText, VIEW_AS_READ_ONLY_TEXT } from './apiError';

function failing(status: number, data: unknown) {
  return (config: InternalAxiosRequestConfig) => {
    const response = { status, statusText: '', headers: {}, config, data } as AxiosResponse;
    return Promise.reject(new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response));
  };
}

describe('serverErrorText', () => {
  it('says View as is read-only for its 403, else the server detail', () => {
    expect(serverErrorText({ detail: 'Viewing as Ana: read only', code: 'VIEW_AS_READ_ONLY' })).toBe(VIEW_AS_READ_ONLY_TEXT);
    expect(serverErrorText({ detail: 'That job is on another bench.' })).toBe('That job is on another bench.');
    expect(serverErrorText({ error: 'No such SKU' })).toBe('No such SKU');
    expect(serverErrorText({ non_field_errors: ['Pick a grade first.'] })).toBe('Pick a grade first.');
    expect(serverErrorText({ price: ['A number.'] })).toBeNull();
    expect(serverErrorText('<html>')).toBeNull();
  });
});

describe('apiErrorMessage', () => {
  it('never shows axios wording; falls back to the given text', () => {
    const config = { headers: {} } as InternalAxiosRequestConfig;
    const bare = new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', config, null,
      { status: 500, statusText: '', headers: {}, config, data: '<html>' } as AxiosResponse);
    expect(apiErrorMessage(bare, 'Could not save that change')).toBe('Could not save that change');
    expect(apiErrorMessage(new Error('Offline'), 'x')).toBe('Offline');
    expect(apiErrorMessage(null, 'x')).toBe('x');
  });
});

describe('API client', () => {
  it('puts the server words on every failed request, and View as says it is read-only', async () => {
    const viewAs = await api.post('/restoration/x/', {}, {
      adapter: failing(403, { detail: 'Viewing as Ana: read only', code: 'VIEW_AS_READ_ONLY' }),
    }).catch((e: AxiosError) => e);
    expect((viewAs as AxiosError).message).toBe(VIEW_AS_READ_ONLY_TEXT);
    expect(((viewAs as AxiosError).response?.data as { detail: string }).detail).toBe(VIEW_AS_READ_ONLY_TEXT);

    const other = await api.post('/x/', {}, { adapter: failing(400, { detail: 'Pick a grade first.' }) })
      .catch((e: AxiosError) => e);
    expect((other as AxiosError).message).toBe('Pick a grade first.');
    expect(apiErrorMessage(other, 'x')).toBe('Pick a grade first.');
  });
});
