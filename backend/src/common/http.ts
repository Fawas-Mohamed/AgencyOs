import { StreamableFile, ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable, NestInterceptor, ExecutionContext, CallHandler, ValidationPipe, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map } from 'rxjs';
export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super({ success: false, message, code, details }, status);
  }
}
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(data => data instanceof StreamableFile ? data : ({ success: true, data, message: 'Operation completed successfully' })));
  }
}
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    let status = 500;
    let payload: Record<string, unknown> = { success: false, message: 'An unexpected error occurred', code: 'INTERNAL_ERROR', details: {} };
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === 'object' && 'code' in body) payload = body as Record<string, unknown>;
      else {
        const codes: Record<number,string> = { 400: 'VALIDATION_ERROR', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'FILE_TOO_LARGE', 429: 'RATE_LIMITED' };
        const raw = typeof body === 'object' && 'message' in body ? body.message : null;
        payload = { success: false, message: status === 401 ? 'Authentication required' : status === 403 ? 'Permission denied' : status === 404 ? 'Record not found' : status === 400 ? 'Invalid request' : 'Request could not be completed', code: codes[status] ?? 'REQUEST_ERROR', details: status === 400 && Array.isArray(raw) ? { errors: raw } : {} };
      }
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(error.code)) {
      status = 409; payload = { success: false, message: 'Record changed; reload and retry', code: 'CONFLICT', details: {} };
    }
    host.switchToHttp().getResponse().status(status).json(payload);
  }
}
export function validationPipe() {
  return new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
    forbidUnknownValues: true, validationError: { target: false, value: false },
    exceptionFactory: errors => {
      const collect = (list: typeof errors, prefix = ''): string[] => list.flatMap(e => [
        ...Object.values(e.constraints ?? {}).map(m => prefix + m),
        ...collect(e.children ?? [], prefix + e.property + '.'),
      ]);
      return new BadRequestException({ success: false, message: 'Invalid request', code: 'VALIDATION_ERROR', details: { errors: collect(errors) } });
    },
  });
}
