import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { fileUrl, getFile, storeBase64 } from '../services/files.js';

export const filesRouter = Router();

/**
 * Serves stored binaries (avatars, post photos, assignment files, materials).
 * A valid session is required so uploads are never publicly enumerable.
 */
filesRouter.get('/:id', requireAuth, async (req, res) => {
  const file = await getFile(idParam(req));
  if (!file) throw notFound('That file no longer exists.');

  const etag = `W/"${file.id}-${file.size}"`;
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    req.query.download ? `attachment; filename="${file.name.replace(/["\r\n]/g, '')}"` : 'inline',
  );
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.end(file.data);
});

/** Generic upload endpoint (used by profile editing and assignment attachments). */
filesRouter.post('/', requireAuth, async (req, res) => {
  const body = parse(
    z.object({
      file: z.object({
        data: z.string().max(12_000_000),
        name: z.string().max(200).optional(),
        mimeType: z.string().max(100).optional(),
      }),
      kind: z.enum(['image', 'document', 'any']).optional(),
    }),
    req.body,
  );
  const file = await storeBase64(body.file, {
    ownerId: req.currentUser!.id,
    kind: body.kind ?? 'any',
  });
  res.status(201).json({ id: file!.id, url: fileUrl(file!.id), size: file!.size, mime: file!.mime });
});
