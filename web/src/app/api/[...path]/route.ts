import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy to the Alveron API.
 * Adds the internal Bearer token here so the browser never sees it.
 * The user session token (X-User-Token) is forwarded from the browser for
 * user-scoped actions (approval attribution, RBAC).
 * The token lives in web/.env.local (server-only, not NEXT_PUBLIC_).
 */

const API = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3100';
const TOKEN = process.env.ALVERON_INTERNAL_TOKEN || '';

async function proxy(req: NextRequest, path: string[]) {
  const target = new URL(`${API}/api/${path.join('/')}`);
  req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };
  const userToken = req.headers.get('x-user-token');
  if (userToken) headers['X-User-Token'] = userToken;

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
  const res = await fetch(target, { method: req.method, headers, body });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}

export const GET = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const POST = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const PATCH = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const PUT = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const DELETE = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
