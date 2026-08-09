import { Injectable, Logger } from '@nestjs/common';

export type AlertSeverity = 'warning' | 'critical' | 'recovery';

export function safeAlertError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(?:https?|rediss?):\/\/\S+/gi, '[redacted-url]')
    .replace(/[A-Za-z0-9_:\/-]{48,}/g, '[redacted-value]')
    .slice(0, 300);
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly active = new Set<string>();

  async setCondition(
    key: string,
    failing: boolean,
    title: string,
    details: Record<string, unknown>,
    severity: Exclude<AlertSeverity, 'recovery'> = 'critical',
  ): Promise<void> {
    if (failing && !this.active.has(key)) {
      this.active.add(key);
      await this.send(key, severity, title, details);
    } else if (!failing && this.active.delete(key)) {
      await this.send(key, 'recovery', `${title} recovered`, details);
    }
  }

  async send(
    key: string,
    severity: AlertSeverity,
    title: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) {
      this.logger.warn(`[${severity}] ${title}: ${JSON.stringify(details)}`);
      return;
    }
    if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
      this.logger.error('ALERT_WEBHOOK_URL must use HTTPS in production');
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const token = process.env.ALERT_WEBHOOK_BEARER_TOKEN;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source: 'orba-api',
          key,
          severity,
          title,
          text: `[${severity.toUpperCase()}] ${title}`,
          details,
          occurredAt: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.logger.error(`Alert delivery failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
