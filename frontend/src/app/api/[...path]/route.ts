import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolved = await params;
  return handleProxy(request, resolved);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolved = await params;
  return handleProxy(request, resolved);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolved = await params;
  return handleProxy(request, resolved);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolved = await params;
  return handleProxy(request, resolved);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolved = await params;
  return handleProxy(request, resolved);
}

const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

async function handleProxy(request: NextRequest, params: { path: string[] }) {
  const path = (params.path || []).join('/');
  const search = request.nextUrl.search || '';
  const targetUrl = `${BACKEND_URL}/api/${path}${search}`;

  const headers = new Headers();
  request.headers.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower)) {
      headers.set(key, val);
    }
  });

  const incomingHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const incomingProto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  headers.set('x-forwarded-host', incomingHost);
  headers.set('x-forwarded-proto', incomingProto);
  headers.set('host', '127.0.0.1:4000');

  let body: BodyInit | undefined = undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.arrayBuffer();
    } catch {}
  }

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });

    const resHeaders = new Headers();
    res.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        resHeaders.set(key, val);
      }
    });

    if (typeof (res.headers as any).getSetCookie === 'function') {
      const cookies = (res.headers as any).getSetCookie();
      for (const c of cookies) {
        resHeaders.append('set-cookie', c);
      }
    } else {
      const sc = res.headers.get('set-cookie');
      if (sc) resHeaders.set('set-cookie', sc);
    }

    const resBody = await res.arrayBuffer();
    return new NextResponse(resBody, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    });
  } catch (err: any) {
    // Fallback attempt to localhost if 127.0.0.1 failed
    try {
      const fallbackUrl = `http://localhost:4000/api/${path}${search}`;
      headers.set('host', 'localhost:4000');
      const resFallback = await fetch(fallbackUrl, {
        method: request.method,
        headers,
        body,
        redirect: 'manual',
      });
      const resHeaders = new Headers();
      resFallback.headers.forEach((val, key) => {
        if (key.toLowerCase() !== 'set-cookie') resHeaders.set(key, val);
      });
      const cookies = typeof (resFallback.headers as any).getSetCookie === 'function' ? (resFallback.headers as any).getSetCookie() : [];
      for (const c of cookies) resHeaders.append('set-cookie', c);
      const resBody = await resFallback.arrayBuffer();
      return new NextResponse(resBody, {
        status: resFallback.status,
        statusText: resFallback.statusText,
        headers: resHeaders,
      });
    } catch (fallbackErr: any) {
      return NextResponse.json(
        { message: 'AutoWork backend service is offline. Run start.bat on host.', error: fallbackErr?.message || err?.message },
        { status: 502 }
      );
    }
  }
}
