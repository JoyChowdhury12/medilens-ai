import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app, process.env.FRONTEND_ORIGIN);
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`MediLens backend running on http://localhost:${port}`);
}
bootstrap();
