import { useState } from 'react';
import { apiDelete, apiPost, dataUrlToPayload, errorMessage } from '../lib/api';
import { useAction, useResource } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import { CameraCapture } from '../components/CameraCapture';
import {
  Badge,
  Card,
  DarkButton,
  EmptyState,
  ErrorState,
  GhostButton,
  InlineError,
  Modal,
  SectionHeader,
  Skeleton,
  inputClass,
} from '../components/ui';
import { relativeTime } from '../lib/format';
import type { Community, Post, PostComment, Project, StudyRoom } from '../types';

export const CommunityContainer = ({ onJoinRoom }: { onJoinRoom: (room: StudyRoom) => void }) => {
  const [tab, setTab] = useState<'feed' | 'groups' | 'hub'>('feed');

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="flex border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10 px-4 pt-2">
        {(['feed', 'groups', 'hub'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 pb-3 text-sm font-bold capitalize ${
              tab === key
                ? 'text-ksitmb dark:text-blue-400 border-b-2 border-ksitmb dark:border-blue-400'
                : 'text-gray-400'
            }`}
          >
            {key === 'hub' ? 'Innovation Hub' : key}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 pb-20">
        {tab === 'feed' && <Feed />}
        {tab === 'groups' && <Groups onJoinRoom={onJoinRoom} />}
        {tab === 'hub' && <Hub />}
      </div>
    </div>
  );
};

/* ------------------------------- Feed ------------------------------------ */

const Feed = () => {
  const { user } = useAuth();
  const { data, loading, error, refetch, setData } = useResource<{ posts: Post[] }>('/api/posts');
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [error1, setError1] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);

  const publish = useAction(async () => {
    setError1(null);
    const res = await apiPost<{ id: string }>('/api/posts', {
      content: text.trim(),
      image: image ? dataUrlToPayload(image, 'post.jpg') : undefined,
    });
    setText('');
    setImage(null);
    refetch();
    return res;
  });

  const like = useAction(async (post: Post) => {
    const res = await apiPost<{ liked: boolean; likeCount: number }>(`/api/posts/${post.id}/like`);
    setData((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === post.id ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p,
            ),
          }
        : prev,
    );
  });

  const remove = useAction(async (id: string) => {
    await apiDelete(`/api/posts/${id}`);
    refetch();
  });

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={(img) => {
          setImage(img);
          setShowCamera(false);
        }}
        onClose={() => setShowCamera(false)}
        overlayText="Snap for Community"
      />
    );
  }

  return (
    <>
      <Card className="mb-4">
        <div className="flex gap-3 mb-3">
          <img src={user?.avatarUrl} className="w-10 h-10 rounded-full bg-gray-200" alt="" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's happening on campus?"
            className="flex-1 bg-gray-50 dark:bg-slate-900 rounded-lg p-3 text-sm resize-none outline-none dark:text-white"
            rows={2}
          />
        </div>
        {image && (
          <div className="relative mb-3">
            <img src={image} className="w-full h-40 object-cover rounded-lg" alt="" />
            <button
              onClick={() => setImage(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setShowCamera(true)}
            className="text-ksitmb dark:text-blue-400 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"
            aria-label="Add a photo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => void publish.run().catch((err) => setError1(errorMessage(err)))}
            disabled={publish.running || (!text.trim() && !image)}
            className="bg-ksitmb text-white px-4 py-1.5 rounded-full text-sm font-bold disabled:opacity-50"
          >
            {publish.running ? 'Posting…' : 'Post'}
          </button>
        </div>
        {error1 && <p className="text-xs text-red-500 mt-2">{error1}</p>}
      </Card>

      {loading && <Skeleton rows={2} />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && data.posts.length === 0 && (
        <EmptyState icon="💬" title="No posts yet" hint="Be the first to share something with the KSITM community." />
      )}

      {data?.posts.map((post) => (
        <Card key={post.id}>
          <div className="flex gap-3 mb-3">
            <img src={post.authorAvatar} className="w-10 h-10 rounded-full bg-gray-200" alt="" />
            <div className="flex-1">
              <h4 className="font-bold text-gray-800 dark:text-white text-sm">{post.authorName}</h4>
              <p className="text-xs text-gray-400">{relativeTime(post.createdAt)}</p>
            </div>
            {post.authorId === user?.id && (
              <button
                onClick={() => void remove.run(post.id).catch(() => undefined)}
                className="text-[10px] text-gray-400 hover:text-red-500"
              >
                Delete
              </button>
            )}
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200 mb-3 whitespace-pre-wrap">{post.content}</p>
          {post.imageUrl && <img src={post.imageUrl} className="w-full h-48 object-cover rounded-lg mb-3" alt="" />}
          <div className="flex gap-6 border-t border-gray-100 dark:border-slate-700 pt-3">
            <button
              onClick={() => void like.run(post).catch((err) => setError1(errorMessage(err)))}
              className={`flex items-center gap-1.5 text-xs font-bold ${
                post.likedByMe ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill={post.likedByMe ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              {post.likeCount}
            </button>
            <button
              onClick={() => setCommentsFor(post)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              {post.commentCount}
            </button>
          </div>
        </Card>
      ))}

      {commentsFor && (
        <CommentsModal
          post={commentsFor}
          onClose={() => setCommentsFor(null)}
          onChanged={refetch}
        />
      )}
    </>
  );
};

const CommentsModal = ({ post, onClose, onChanged }: { post: Post; onClose: () => void; onChanged: () => void }) => {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useResource<{ comments: PostComment[] }>(
    `/api/posts/${post.id}/comments`,
    [post.id],
  );
  const [text, setText] = useState('');
  const send = useAction(async () => {
    await apiPost(`/api/posts/${post.id}/comments`, { content: text.trim() });
    setText('');
    refetch();
    onChanged();
  });
  const remove = useAction(async (commentId: string) => {
    await apiDelete(`/api/posts/${post.id}/comments/${commentId}`);
    refetch();
    onChanged();
  });

  return (
    <Modal title="Comments" onClose={onClose}>
      <div className="space-y-3">
        {loading && <Skeleton rows={2} />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {data && data.comments.length === 0 && <EmptyState icon="💬" title="No comments yet" />}
        {data?.comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <img src={c.avatarUrl} className="w-8 h-8 rounded-full bg-gray-200" alt="" />
            <div className="flex-1 bg-gray-50 dark:bg-slate-800 rounded-lg p-2">
              <div className="flex justify-between">
                <p className="text-xs font-bold text-gray-800 dark:text-white">{c.authorName}</p>
                {c.authorId === user?.id && (
                  <button
                    onClick={() => void remove.run(c.id).catch(() => undefined)}
                    className="text-[10px] text-gray-400 hover:text-red-500"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">{c.content}</p>
              <p className="text-[10px] text-gray-400 mt-1">{relativeTime(c.createdAt)}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment…"
            className={inputClass}
          />
          <GhostButton onClick={() => void send.run().catch(() => undefined)} disabled={send.running || !text.trim()}>
            Send
          </GhostButton>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------- Groups ---------------------------------- */

const Groups = ({ onJoinRoom }: { onJoinRoom: (room: StudyRoom) => void }) => {
  const { user } = useAuth();
  const rooms = useResource<{ rooms: StudyRoom[] }>('/api/rooms');
  const communities = useResource<{ communities: Community[] }>('/api/communities');
  const [showRoom, setShowRoom] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const joinRoom = useAction(async (room: StudyRoom) => {
    const res = await apiPost<{ conversationId: string }>(`/api/rooms/${room.id}/join`);
    rooms.refetch();
    onJoinRoom({ ...room, joined: true });
    return res;
  });

  const leaveRoom = useAction(async (room: StudyRoom) => {
    await apiDelete(`/api/rooms/${room.id}/join`);
    rooms.refetch();
  });

  const toggleCommunity = useAction(async (community: Community) => {
    if (community.joined) await apiDelete(`/api/communities/${community.id}/join`);
    else await apiPost(`/api/communities/${community.id}/join`);
    communities.refetch();
  });

  return (
    <div className="space-y-4">
      <InlineError message={actionError} />
      <SectionHeader title="Study Rooms (Live)" action="Create Room" onAction={() => setShowRoom(true)} />

      {rooms.loading && <Skeleton rows={1} />}
      {rooms.error && <ErrorState message={rooms.error} onRetry={rooms.refetch} />}
      {rooms.data && rooms.data.rooms.length === 0 && (
        <EmptyState icon="🧑‍🏫" title="No live rooms" hint="Create a study room and invite classmates to the whiteboard." />
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {rooms.data?.rooms.map((room) => (
          <div
            key={room.id}
            onClick={() =>
              room.joined
                ? onJoinRoom(room)
                : void joinRoom.run(room).catch((err) => setActionError(errorMessage(err)))
            }
            className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-3 rounded-xl cursor-pointer shadow-lg hover:scale-105 transition-transform"
          >
            <div className="flex justify-between items-start">
              <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold">LIVE</span>
              <span className="text-xs">👥 {room.participantCount}</span>
            </div>
            <h3 className="font-bold mt-2 text-sm">{room.title}</h3>
            <p className="text-[10px] opacity-80 mt-1">{room.hostName}</p>
            <p className="text-[10px] opacity-70 mt-1">{room.joined ? 'Tap to open' : 'Tap to join'}</p>
            {room.hostId === user?.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void leaveRoom.run(room).catch((err) => setActionError(errorMessage(err)));
                }}
                className="text-[10px] underline opacity-80 mt-1"
              >
                Leave
              </button>
            )}
          </div>
        ))}
      </div>

      <SectionHeader title="Your Communities" action="+ New" onAction={() => setShowCommunity(true)} />
      {communities.loading && <Skeleton rows={2} />}
      {communities.error && <ErrorState message={communities.error} onRetry={communities.refetch} />}
      {communities.data && communities.data.communities.length === 0 && (
        <EmptyState icon="👥" title="No communities yet" hint="Start one for your club, class or interest group." />
      )}
      {communities.data?.communities.map((comm) => (
        <Card key={comm.id} className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl">
            {comm.icon}
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-gray-800 dark:text-white">{comm.name}</h4>
            <p className="text-xs text-gray-500 line-clamp-1">
              {comm.description || `${comm.memberCount} members`}
            </p>
          </div>
          <GhostButton
            onClick={() => void toggleCommunity.run(comm).catch((err) => setActionError(errorMessage(err)))}
            disabled={toggleCommunity.running}
          >
            {comm.joined ? 'Leave' : 'Join'}
          </GhostButton>
        </Card>
      ))}

      {showRoom && (
        <CreateRoomModal
          onClose={() => setShowRoom(false)}
          onDone={() => {
            setShowRoom(false);
            rooms.refetch();
          }}
        />
      )}
      {showCommunity && (
        <CreateCommunityModal
          onClose={() => setShowCommunity(false)}
          onDone={() => {
            setShowCommunity(false);
            communities.refetch();
          }}
        />
      )}
    </div>
  );
};

const CreateRoomModal = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const create = useAction(async () => {
    await apiPost('/api/rooms', { title: title.trim(), topic: topic.trim() });
    onDone();
  });
  return (
    <Modal title="Create Study Room" onClose={onClose}>
      <div className="space-y-3">
        <input placeholder="Room title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        <input placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} />
        <InlineError message={create.error} />
        <DarkButton onClick={() => void create.run().catch(() => undefined)} disabled={create.running || title.trim().length < 3}>
          {create.running ? 'Creating…' : 'Start room'}
        </DarkButton>
      </div>
    </Modal>
  );
};

const CreateCommunityModal = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const [form, setForm] = useState({ name: '', icon: '💬', description: '' });
  const create = useAction(async () => {
    await apiPost('/api/communities', {
      name: form.name.trim(),
      icon: form.icon.trim() || '💬',
      description: form.description.trim(),
    });
    onDone();
  });
  return (
    <Modal title="New Community" onClose={onClose}>
      <div className="space-y-3">
        <input placeholder="Community name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        <input placeholder="Icon (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className={inputClass} />
        <textarea
          placeholder="What is it about?"
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={inputClass}
        />
        <InlineError message={create.error} />
        <DarkButton onClick={() => void create.run().catch(() => undefined)} disabled={create.running || form.name.trim().length < 3}>
          {create.running ? 'Creating…' : 'Create community'}
        </DarkButton>
      </div>
    </Modal>
  );
};

/* --------------------------------- Hub ----------------------------------- */

const Hub = () => {
  const { user } = useAuth();
  const { data, loading, error, refetch, setData } = useResource<{ projects: Project[] }>('/api/projects');
  const [showSubmit, setShowSubmit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const vote = useAction(async (project: Project) => {
    const res = await apiPost<{ voted: boolean; voteCount: number }>(`/api/projects/${project.id}/vote`);
    setData((prev) =>
      prev
        ? {
            ...prev,
            projects: prev.projects.map((p) =>
              p.id === project.id ? { ...p, votedByMe: res.voted, voteCount: res.voteCount } : p,
            ),
          }
        : prev,
    );
  });

  return (
    <div className="space-y-4">
      <InlineError message={actionError} />
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-4 text-white shadow-lg">
        <h3 className="font-bold text-lg">KSITM Innovation Hub 🚀</h3>
        <p className="text-sm opacity-90 mb-3">Showcase your projects and get funding!</p>
        <button onClick={() => setShowSubmit(true)} className="bg-white text-orange-600 px-4 py-2 rounded-lg text-xs font-bold">
          Submit Project
        </button>
      </div>

      {loading && <Skeleton rows={2} />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && data.projects.length === 0 && (
        <EmptyState icon="🚀" title="No projects yet" hint="Submit the first project to the KSITM Innovation Hub." />
      )}

      {data?.projects.map((proj) => (
        <Card key={proj.id}>
          <div className="flex justify-between mb-2">
            <span className="text-xs font-bold text-orange-500 uppercase tracking-wide">{proj.category}</span>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              {proj.status !== 'approved' && <Badge tone="orange">{proj.status}</Badge>}
              <span>⭐ {proj.voteCount}</span>
            </div>
          </div>
          <h3 className="font-bold text-gray-800 dark:text-white">{proj.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-3">{proj.description}</p>
          <div className="flex justify-between items-center border-t border-gray-100 dark:border-slate-700 pt-2">
            <span className="text-xs font-medium text-gray-500">by {proj.authorName}</span>
            <button
              onClick={() => void vote.run(proj).catch((err) => setActionError(errorMessage(err)))}
              className={`text-xs font-bold ${proj.votedByMe ? 'text-ksitmo' : 'text-ksitmb dark:text-blue-400'}`}
            >
              {proj.votedByMe ? 'Voted ✓' : 'Vote'}
            </button>
          </div>
        </Card>
      ))}

      {user?.role === 'student' && (
        <p className="text-[10px] text-gray-400 text-center">
          Submitted projects go live after an HOD or administrator reviews them.
        </p>
      )}

      {showSubmit && (
        <SubmitProjectModal
          onClose={() => setShowSubmit(false)}
          onDone={() => {
            setShowSubmit(false);
            refetch();
          }}
        />
      )}
    </div>
  );
};

const SubmitProjectModal = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const [form, setForm] = useState({ title: '', category: '', description: '' });
  const create = useAction(async () => {
    await apiPost('/api/projects', {
      title: form.title.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
    });
    onDone();
  });
  return (
    <Modal title="Submit Project" onClose={onClose} wide>
      <div className="space-y-3">
        <input placeholder="Project title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
        <input
          placeholder="Category (IoT, Software, Agriculture…)"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className={inputClass}
        />
        <textarea
          rows={4}
          placeholder="Describe the problem, your solution and the impact."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={inputClass}
        />
        <InlineError message={create.error} />
        <DarkButton
          onClick={() => void create.run().catch(() => undefined)}
          disabled={create.running || form.title.trim().length < 3 || form.description.trim().length < 10}
        >
          {create.running ? 'Submitting…' : 'Submit for review'}
        </DarkButton>
      </div>
    </Modal>
  );
};

export default CommunityContainer;
