import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { Injectable as Injectable2 } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: any, context?: string) {
    this.printMessage(message, 'LOG', context);
  }

  error(message: any, trace?: string, context?: string) {
    this.printMessage(message, 'ERROR', context);
    if (trace) {
      console.trace(trace);
    }
  }

  warn(message: any, context?: string) {
    this.printMessage(message, 'WARN', context);
  }

  debug(message: any, context?: string) {
    this.printMessage(message, 'DEBUG', context);
  }

  verbose(message: any, context?: string) {
    this.printMessage(message, 'VERBOSE', context);
  }

  private printMessage(message: any, level: string, context?: string) {
    const timestamp = new Date().toISOString();
    const ctx = context || this.context || 'Application';
    
    const logEntry = {
      timestamp,
      level,
      context: ctx,
      message: typeof message === 'object' ? JSON.stringify(message) : message,
    };

    console.log(JSON.stringify(logEntry));
  }
}
