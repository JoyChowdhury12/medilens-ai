import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

/** Shared by main.ts and the tests so both run the app the same way. */
export function setupApp(app: INestApplication, origin?: string) {
  app.use(helmet());
  app.enableCors({ origin: origin || 'http://localhost:3000', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}
