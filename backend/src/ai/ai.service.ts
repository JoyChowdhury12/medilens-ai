import { BadGatewayException, Global, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ConfirmedTest {
  code: string;
  value: number;
  printed_low?: number | null;
  printed_high?: number | null;
}

/** Talks to our own Python AI service. No external AI API is used anywhere. */
@Injectable()
export class AiService {
  private base: string;
  constructor(cfg: ConfigService) { this.base = cfg.get('AI_SERVICE_URL') || 'http://localhost:8000'; }

  private async call(path: string, init: RequestInit, timeoutMs = 120_000) {
    let res: Response;
    try {
      res = await fetch(this.base + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ServiceUnavailableException('The report reader is not available right now. Please try again shortly.');
    }
    if (res.status === 400) {
      const body: any = await res.json().catch(() => ({}));
      throw new BadGatewayException(body.detail || 'The report could not be read.');
    }
    if (!res.ok) throw new BadGatewayException('The report reader returned an error.');
    return res.json();
  }

  extract(buffer: Buffer, mime: string, filename: string) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename);
    return this.call('/extract', { method: 'POST', body: form });
  }

  /** Fast: statuses, reasons, specialist and template explanations (the model is not used here). */
  interpret(tests: ConfirmedTest[], sex: string | null, age?: number | null) {
    return this.call('/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sex, age: age ?? null, tests, use_model: false }),
    });
  }

  /** Slow: the fine-tuned model's Bangla explanations for out-of-range values, as { code: text }. */
  explain(tests: ConfirmedTest[], sex: string | null, age?: number | null, codes?: string[]): Promise<{ explanations: Record<string, string> }> {
    return this.call('/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sex, age: age ?? null, tests, codes: codes ?? null }),
    }, 180_000);
  }
}

@Global()
@Module({ providers: [AiService], exports: [AiService] })
export class AiModule {}
