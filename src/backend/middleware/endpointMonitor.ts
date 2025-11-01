import { Request, Response, NextFunction } from 'express';
import { execute } from '../database/helpers.js';

interface EndpointStats {
  endpoint: string;
  method: string;
  count: number;
  avgResponseTime: number;
  lastCalled: Date;
}

class EndpointMonitor {
  private stats: Map<string, EndpointStats> = new Map();
  private logToDatabase = true;

  async logRequest(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const endpoint = req.path;
    const method = req.method;
    const key = `${method}:${endpoint}`;

    // Capture response finish
    const originalSend = res.send;
    res.send = function (data: any) {
      const responseTime = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Update in-memory stats
      const stats = endpointMonitor.stats.get(key);
      if (stats) {
        stats.count++;
        stats.avgResponseTime = (stats.avgResponseTime * (stats.count - 1) + responseTime) / stats.count;
        stats.lastCalled = new Date();
      } else {
        endpointMonitor.stats.set(key, {
          endpoint,
          method,
          count: 1,
          avgResponseTime: responseTime,
          lastCalled: new Date()
        });
      }

      // Log to database (async, non-blocking)
      if (endpointMonitor.logToDatabase) {
        endpointMonitor.saveToDatabase({
          endpoint,
          method,
          statusCode,
          responseTime,
          timestamp: new Date(),
          userId: (req as any).user?.id || null,
          userAgent: req.get('user-agent') || null,
          ip: req.ip || req.socket.remoteAddress || null
        }).catch(err => {
          console.error('Failed to log endpoint call:', err);
        });
      }

      return originalSend.call(this, data);
    };

    next();
  }

  private async saveToDatabase(logData: {
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    timestamp: Date;
    userId: number | null;
    userAgent: string | null;
    ip: string | null;
  }) {
    try {
      await execute(`
        INSERT INTO endpoint_logs (
          endpoint,
          method,
          status_code,
          response_time_ms,
          timestamp,
          user_id,
          user_agent,
          ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        logData.endpoint,
        logData.method,
        logData.statusCode,
        logData.responseTime,
        logData.timestamp.toISOString(),
        logData.userId,
        logData.userAgent,
        logData.ip
      ]);
    } catch (error: any) {
      // Table might not exist yet - silently fail
      if (!error.message?.includes('no such table')) {
        console.error('Error saving endpoint log:', error);
      }
    }
  }

  getStats(): EndpointStats[] {
    return Array.from(this.stats.values()).sort((a, b) => b.count - a.count);
  }

  clearStats() {
    this.stats.clear();
  }

  setDatabaseLogging(enabled: boolean) {
    this.logToDatabase = enabled;
  }
}

export const endpointMonitor = new EndpointMonitor();

export const endpointMonitorMiddleware = (req: Request, res: Response, next: NextFunction) => {
  endpointMonitor.logRequest(req, res, next);
};
