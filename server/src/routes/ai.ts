import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { execute, query } from '../db/index.js';
import { badRequest, serviceUnavailable, upstream } from '../http/errors.js';
import { parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth } from '../auth/middleware.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

const SYSTEM_INSTRUCTION = `You are a friendly, encouraging, and knowledgeable AI Tutor for students at Katsina State Institute of Technology & Management (KSITM).
Your goal is to help students understand their courses (Computer Science, Engineering, Management, etc.).
- Be concise but helpful.
- Use simple English.
- If asked for a quiz, generate 3-5 multiple choice questions.
- If asked to summarize, provide bullet points.
- Always be polite and encouraging.`;

const HISTORY_LIMIT = 20;

interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

async function loadHistory(userId: string): Promise<ChatTurn[]> {
  const rows = await query<{ id: string; role: 'user' | 'model'; content: string; createdAt: Date }>(
    `SELECT id, role, content, created_at AS "createdAt" FROM tutor_messages
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, HISTORY_LIMIT],
  );
  return rows.reverse();
}

/**
 * Calls Gemini from the server so the API key is never shipped to the browser.
 * GEMINI_BASE_URL can be overridden (used by the test-suite stub).
 */
async function callGemini(history: ChatTurn[], systemInstruction: string): Promise<string> {
  if (!config.geminiApiKey) {
    throw serviceUnavailable(
      'The AI tutor is not configured on this server yet (GEMINI_API_KEY is missing).',
    );
  }
  const url = `${config.geminiBaseUrl.replace(/\/$/, '')}/models/${config.geminiModel}:generateContent`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: history.map((turn) => ({
          role: turn.role,
          parts: [{ text: turn.content }],
        })),
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    throw upstream(`Could not reach the AI service: ${(err as Error).message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw upstream(`The AI service responded with ${response.status}. ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw upstream('The AI service returned an empty answer. Please try again.');
  return text;
}

aiRouter.get('/status', (_req, res) => {
  res.json({ enabled: Boolean(config.geminiApiKey), model: config.geminiModel });
});

aiRouter.get('/tutor/history', async (req, res) => {
  const history = await loadHistory(req.currentUser!.id);
  res.json({
    messages: history.map((m, index) => ({
      id: `${index}-${m.role}`,
      role: m.role,
      content: m.content,
    })),
  });
});

aiRouter.post('/tutor/message', async (req, res) => {
  const user = req.currentUser!;
  const { message } = parse(z.object({ message: z.string().trim().min(1).max(4000) }), req.body);

  const history = await loadHistory(user.id);
  const context = [...history, { role: 'user' as const, content: message }];

  // Persist the question first so a failed request still shows what was asked.
  await execute(
    `INSERT INTO tutor_messages (id, user_id, role, content) VALUES ($1, $2, 'user', $3)`,
    [newId(), user.id, message],
  );

  const answer = await callGemini(context, SYSTEM_INSTRUCTION);
  await execute(
    `INSERT INTO tutor_messages (id, user_id, role, content) VALUES ($1, $2, 'model', $3)`,
    [newId(), user.id, answer],
  );
  res.json({ reply: answer });
});

aiRouter.delete('/tutor/history', async (req, res) => {
  await execute('DELETE FROM tutor_messages WHERE user_id = $1', [req.currentUser!.id]);
  res.json({ ok: true });
});

/** Powers the "✨ AI Generate" button on the assignment form. */
aiRouter.post('/assignment-description', async (req, res) => {
  const user = req.currentUser!;
  if (user.role === 'student') throw badRequest('Only staff can generate assignment descriptions.');
  const { courseCode, title } = parse(
    z.object({ courseCode: z.string().trim().max(40), title: z.string().trim().min(3).max(180) }),
    req.body,
  );
  const description = await callGemini(
    [
      {
        role: 'user',
        content: `Write a short, professional assignment description (3-5 sentences) for the course "${courseCode}" with the title "${title}". Target polytechnic students in Nigeria. Do not add a greeting.`,
      },
    ],
    'You write clear academic assignment briefs for Nigerian polytechnic lecturers.',
  );
  res.json({ description });
});
