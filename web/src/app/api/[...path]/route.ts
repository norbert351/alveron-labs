import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy to the Alveron API.
 * Adds the internal Bearer token here so the browser never sees it.
 * The token lives in web/.env.local (server-only, no NEXT_PUBLIC prefix).
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
  // pass through webhook-style headers if the frontend ever needs them
  const wh = req.headers.get('x-webhook-key');
  if (wh) headers['X-Webhook-Key'] = wh;

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `API unreachable: ${e?.message || 'proxy failure'}` },
      { status: 502 }
    );
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const POST = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const PATCH = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const PUT = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
export const DELETE = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, (await ctx.params).path);
