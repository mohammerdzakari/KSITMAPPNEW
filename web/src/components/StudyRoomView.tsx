import { useEffect, useRef, useState } from 'react';
import { apiDelete, apiPost, errorMessage } from '../lib/api';
import { usePolling, useResource } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import { EmptyState, ErrorState, GhostButton, InlineError, Skeleton } from './ui';
import type { StudyRoom } from '../types';

const COLORS = ['#08306B', '#FB8B24', '#EF233C', '#22C55E', '#8B5CF6'];

interface Props {
  room: StudyRoom;
  onClose: () => void;
}

export const StudyRoomView = ({ room, onClose }: Props) => {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const colorIndex = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const participants = useResource<{ participants: { userId: string; name: string; role: string; avatarUrl: string; isHost: boolean }[] }>(
    `/api/rooms/${room.id}/participants`,
    [room.id],
  );

  usePolling(() => participants.refetch(), 10000, true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      const previous = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = rect.width;
      canvas.height = rect.height;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = COLORS[colorIndex.current % COLORS.length];
        if (previous) ctx.putImageData(previous, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const next = point(event);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const changeColor = () => {
    colorIndex.current += 1;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.strokeStyle = COLORS[colorIndex.current % COLORS.length];
  };

  const leave = async () => {
    setLeaving(true);
    try {
      await apiDelete(`/api/rooms/${room.id}/join`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setLeaving(false);
    }
  };

  /** Only the host can close a room; everyone else simply leaves it. */
  const closeRoom = async () => {
    setLeaving(true);
    try {
      await apiPost(`/api/rooms/${room.id}/close`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setLeaving(false);
    }
  };

  const isHost = room.hostId === user?.id;

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-slate-800">
        <button
          onClick={() => void leave()}
          disabled={leaving}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300 disabled:opacity-50"
          aria-label="Leave room"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800 dark:text-white">{room.title}</h2>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            {participants.data?.participants.length ?? room.participantCount} online • {room.hostName}
          </p>
        </div>
        <button onClick={changeColor} className="text-xs font-bold text-ksitmo border border-ksitmo rounded-full px-3 py-1">
          Colour
        </button>
        <button onClick={clearBoard} className="text-xs font-bold text-red-500 border border-red-300 rounded-full px-3 py-1">
          Clear
        </button>
      </div>

      <InlineError message={error} />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 bg-gray-100 dark:bg-slate-800 p-2">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="w-full h-full bg-white rounded-lg shadow-inner touch-none"
            style={{ minHeight: 320 }}
          />
        </div>
        <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-gray-100 dark:border-slate-800 p-4 overflow-y-auto">
          <h3 className="text-xs font-bold uppercase text-gray-500 mb-3">Participants</h3>
          {participants.loading && <Skeleton rows={2} />}
          {participants.error && <ErrorState message={participants.error} onRetry={participants.refetch} />}
          <div className="space-y-2">
            {participants.data?.participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-2">
                <img src={p.avatarUrl} className="w-8 h-8 rounded-full bg-gray-200" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{p.role}</p>
                </div>
                {p.isHost && <span className="text-[9px] font-bold text-ksitmo">HOST</span>}
              </div>
            ))}
          </div>
          {participants.data && participants.data.participants.length === 0 && (
            <EmptyState icon="👥" title="No one here yet" />
          )}

          {isHost && (
            <button
              onClick={() => void closeRoom()}
              disabled={leaving}
              className="w-full mt-6 bg-red-50 text-red-600 font-bold py-2 rounded-xl text-xs disabled:opacity-60"
            >
              {leaving ? 'Closing…' : 'End room for everyone'}
            </button>
          )}
          <p className="text-[10px] text-gray-400 mt-4">
            Room chat continues in your Messages inbox for as long as the room is open.
          </p>
          <GhostButton onClick={() => void leave()} className="w-full mt-2">
            Leave room
          </GhostButton>
        </div>
      </div>
    </div>
  );
};

export default StudyRoomView;
