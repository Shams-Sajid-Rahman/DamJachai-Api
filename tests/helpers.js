import request from 'supertest';
import { createApp } from '../src/app.js';
import { ADMIN } from './testEnv.js';

export const app = createApp();
export const api = () => request(app);

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${(counter += 1)}@example.com`;

export async function registerUser(overrides = {}) {
  const body = { name: 'Test Person', email: uniqueEmail(), password: 'password123', ...overrides };
  const res = await api().post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...body, token: res.body.accessToken, user: res.body.user, cookie: res.headers['set-cookie'] };
}

export async function loginAdmin() {
  const res = await api().post('/api/auth/login').send(ADMIN);
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return res.body.accessToken;
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
