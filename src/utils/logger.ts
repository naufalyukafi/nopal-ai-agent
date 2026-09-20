// Structured Production Logger for Supabase Edge Functions & Node.js
// Supports Console Output & File System Persistence (logs/app.log & logs/error.log)

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
  };
}

class Logger {
  private logDir = 'logs';
  private appLogPath = 'logs/app.log';
  private errorLogPath = 'logs/error.log';
  private isNodeEnv = typeof process !== 'undefined' && process?.versions?.node;

  private formatLog(level: LogLevel, context: string, message: string, error?: unknown, metadata?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: context.toUpperCase(),
      message,
    };

    if (metadata) {
      entry.metadata = metadata;
    }

    if (error) {
      if (error instanceof Error) {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        entry.error = {
          message: String(error),
        };
      }
    }

    return entry;
  }

  private writeToFile(entry: LogEntry) {
    // Only attempt file system write in Node.js/local environments with fs module
    if (!this.isNodeEnv) return;

    try {
      // Dynamic import to prevent Deno bundling errors
      const fs = require('fs');
      const path = require('path');

      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      const logLine = `${JSON.stringify(entry)}\n`;
      fs.appendFileSync(this.appLogPath, logLine, 'utf8');

      if (entry.level === 'ERROR') {
        fs.appendFileSync(this.errorLogPath, logLine, 'utf8');
      }
    } catch {
      // Ignore file writing errors in read-only serverless containers
    }
  }

  private print(entry: LogEntry) {
    const time = entry.timestamp.slice(11, 23); // HH:mm:ss.sss
    const prefix = `[${time}] [${entry.level}] [${entry.context}]`;
    
    // @ts-ignore
    const isProduction = typeof Deno !== 'undefined' && Deno?.env?.get('DENO_DEPLOYMENT_ID');

    if (isProduction) {
      // JSON format for Supabase / CloudWatch log aggregators
      console.log(JSON.stringify(entry));
    } else {
      // Readable colored output for local terminal
      if (entry.level === 'ERROR') {
        console.error(`${prefix} ❌ ${entry.message}`, entry.error?.stack || entry.error?.message || '', entry.metadata || '');
      } else if (entry.level === 'WARN') {
        console.warn(`${prefix} ⚠️ ${entry.message}`, entry.metadata || '');
      } else {
        console.log(`${prefix} ℹ️ ${entry.message}`, entry.metadata || '');
      }
    }

    // Persist to logs/ folder
    this.writeToFile(entry);
  }

  debug(context: string, message: string, metadata?: Record<string, unknown>) {
    this.print(this.formatLog('DEBUG', context, message, undefined, metadata));
  }

  info(context: string, message: string, metadata?: Record<string, unknown>) {
    this.print(this.formatLog('INFO', context, message, undefined, metadata));
  }

  warn(context: string, message: string, metadata?: Record<string, unknown>) {
    this.print(this.formatLog('WARN', context, message, undefined, metadata));
  }

  error(context: string, message: string, error?: unknown, metadata?: Record<string, unknown>) {
    this.print(this.formatLog('ERROR', context, message, error, metadata));
  }
}

export const logger = new Logger();
