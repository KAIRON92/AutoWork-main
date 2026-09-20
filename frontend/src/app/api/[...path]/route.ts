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

  let res: Response | null = null;
  let lastError: any = null;
  const urlsToTry = [targetUrl, `http://localhost:4000/api/${path}${search}`];

  for (const url of urlsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (url.includes('localhost:4000')) {
          headers.set('host', 'localhost:4000');
        }
        res = await fetch(url, {
          method: request.method,
          headers,
          body,
          redirect: 'manual',
        });
        if (res) break;
      } catch (fetchErr: any) {
        lastError = fetchErr;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    }
    if (res) break;
  }

  if (!res) {
    return NextResponse.json(
      { message: 'AutoWork backend service is initializing. Please wait a moment and refresh.', error: lastError?.message || 'Connection refused' },
      { status: 502 }
    );
  }

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
}
