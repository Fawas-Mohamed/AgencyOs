import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cookieName = 'agencyos_session';
function failure(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, message, code, details: {} }, { status });
}
async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (
    !['auth', 'clients', 'requirements', 'files'].includes(path[0]) ||
    path.some((segment) => !/^[-a-zA-Z0-9]+$/.test(segment))
  )
    return failure(404, 'NOT_FOUND', 'Record not found');
  const mutating = !['GET', 'HEAD'].includes(request.method);
  const appOrigin = process.env.APP_ORIGIN;
  const internalBase = process.env.API_INTERNAL_URL;
  if (!appOrigin || !internalBase)
    return failure(503, 'CONFIGURATION_ERROR', 'Service is not configured');
  if (mutating && request.headers.get('origin') !== new URL(appOrigin).origin)
    return failure(403, 'INVALID_ORIGIN', 'Request origin is not allowed');
  const jar = await cookies();
  if (path.join('/') === 'auth/logout' && request.method === 'POST') {
    jar.delete(cookieName);
    return NextResponse.json({
      success: true,
      data: { signedOut: true },
      message: 'Operation completed successfully',
    });
  }
  const login = path.join('/') === 'auth/login' && request.method === 'POST';
  const token = jar.get(cookieName)?.value;
  if (!login && !token) return failure(401, 'UNAUTHENTICATED', 'Authentication required');
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 21 * 1024 * 1024)
    return failure(413, 'FILE_TOO_LARGE', 'Request exceeds the size limit');
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  if (token && !login) headers.set('authorization', 'Bearer ' + token);
  try {
    const body = mutating ? await request.arrayBuffer() : undefined;
    if (body && body.byteLength > 21 * 1024 * 1024)
      return failure(413, 'FILE_TOO_LARGE', 'Request exceeds the size limit');
    const upstream = await fetch(
      internalBase.replace(/\/$/, '') +
        '/' +
        path.map(encodeURIComponent).join('/') +
        request.nextUrl.search,
      {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      },
    );
    if (upstream.status === 401) jar.delete(cookieName);
    if (upstream.ok && path[path.length - 1] === 'download') {
      const responseHeaders = new Headers({
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      for (const key of ['content-type', 'content-disposition', 'content-length']) {
        const value = upstream.headers.get(key);
        if (value) responseHeaders.set(key, value);
      }
      return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
    }
    const payload = await upstream.json().catch(() => null);
    if (!payload || typeof payload.success !== 'boolean')
      return failure(502, 'UPSTREAM_ERROR', 'Service could not complete the request');
    if (login && upstream.ok) {
      if (typeof payload.data?.accessToken !== 'string')
        return failure(502, 'UPSTREAM_ERROR', 'Sign in could not be completed');
      jar.set(cookieName, payload.data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600,
        path: '/',
      });
      payload.data = { user: payload.data.user };
    }
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return failure(502, 'SERVICE_UNAVAILABLE', 'Service is unavailable. Please retry.');
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
