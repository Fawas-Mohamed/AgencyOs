import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { EnvelopeInterceptor, SafeExceptionFilter, validationPipe } from './common/http';
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(
    (
      _request: import('express').Request,
      response: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      response.setHeader('Cache-Control', 'private, no-store');
      next();
    },
  );
  app.enableCors({ origin: config.getOrThrow('FRONTEND_URL'), credentials: false });
  app.useGlobalPipes(validationPipe());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableShutdownHooks();
}
