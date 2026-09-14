import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { HttpError, notFound } from './http/errors.js';
import { originGuard } from './http/originGuard.js';
import { attachUser } from './auth/middleware.js';
import { databaseDriverName } from './db/index.js';
import { adminRouter } from './routes/admin.js';
import { aiRouter } from './routes/ai.js';
import { announcementsRouter } from './routes/announcements.js';
import { assignmentsRouter } from './routes/assignments.js';
import { attendanceRouter } from './routes/attendance.js';
import { authRouter } from './routes/auth.js';
import { communitiesRouter } from './routes/communities.js';
import { coursesRouter } from './routes/courses.js';
import { filesRouter } from './routes/files.js';
import { conversationsRouter, peopleRouter } from './routes/messages.js';
import { moderationRouter } from './routes/moderation.js';
import { notificationsRouter } from './routes/notifications.js';
import { postsRouter } from './routes/posts.js';
import { projectsRouter } from './routes/projects.js';
import { roomsRouter } from './routes/rooms.js';
import { searchRouter } from './routes/search.js';

const jsonLimit = `${Math.ceil((config.maxUploadBytes * 1.5) / (1024 * 1024))}mb`;

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (!config.isProduction) app.set('trust proxy', true);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.use(express.json({ limit: jsonLimit }));

  app.get('/api/health', async (_req, res) => {
    res.json({ ok: true, driver: await databaseDriverName(), env: config.nodeEnv });
  });

  app.use('/api', attachUser);
  app.use('/api', originGuard);

  app.use('/api/auth', authRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/announcements', announcementsRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/communities', communitiesRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/people', peopleRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/moderation', moderationRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/ai', aiRouter);

  app.use('/api', (_req, _res, next) => next(notFound('Unknown API endpoint.')));

  // --- Static frontend (single deployable unit) ---
  const indexHtml = path.join(config.publicDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.publicDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(indexHtml);
    });
  } else {
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res
        .status(503)
        .type('text/plain')
        .send('Frontend bundle not found. Run `npm run build` or use `npm run dev` for development.');
    });
  }

  // --- Error handling ---
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: { message: err.message, code: err.code, details: err.details ?? null },
      });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: { message: 'Malformed JSON body.', code: 'bad_request' } });
      return;
    }
    console.error('[error]', err);
    res.status(500).json({
      error: {
        message: config.isProduction ? 'Something went wrong on our side.' : String((err as Error)?.message ?? err),
        code: 'server_error',
      },
    });
  });

  return app;
}
