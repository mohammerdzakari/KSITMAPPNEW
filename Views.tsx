




import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { MOCK_ANNOUNCEMENTS, MOCK_COMMUNITIES, MOCK_COURSES, MOCK_POSTS, MOCK_PROJECTS, LOGO_URL, KSITM_COURSES_DATA, ADMIN_VERIFICATION_CODE, MOCK_PENDING_CONTENT, MOCK_CHATS, MOCK_MESSAGES, MOCK_STUDY_ROOMS, MOCK_ASSIGNMENTS, MOCK_SUBMISSIONS, MOCK_ALL_STUDENTS } from './constants';
import { AppTab, StudentProfile, AdminProfile, UserRole, PendingContent, ChatSession, DirectMessage, StudyRoom, Assignment, AssignmentSubmission, Post } from './types';

// --- Shared Components ---
const SectionHeader = ({ title, action, onAction }: { title: string, action?: string, onAction?: () => void }) => (
  <div className="flex justify-between items-center mb-4">
    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{title}</h2>
    {action && <button onClick={onAction} className="text-sm text-ksitmo font-medium hover:underline">{action}</button>}
  </div>
);

interface CardProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = "", onClick }) => (
  <div onClick={onClick} className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}>
    {children}
  </div>
);

// --- Camera Component ---
const CameraCapture = ({ onCapture, onClose, overlayText }: { onCapture: (img: string) => void, onClose: () => void, overlayText?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    let stream: MediaStream | null = null;
    
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, 
            audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user' },
                audio: false 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (e) {
            console.error("Camera Error: ", e);
            onClose();
        }
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onClose]);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            onCapture(dataUrl);
        }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
       <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
          {overlayText && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <div className="w-64 h-64 border-2 border-white/50 rounded-xl relative">
                     <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-ksitmo -mt-1 -ml-1"></div>
                     <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-ksitmo -mt-1 -mr-1"></div>
                     <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-ksitmo -mb-1 -ml-1"></div>
                     <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-ksitmo -mb-1 -mr-1"></div>
                 </div>
                 <p className="absolute bottom-20 text-white font-bold bg-black/50 px-4 py-1 rounded-full">{overlayText}</p>
             </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
          <button onClick={onClose} className="absolute top-6 right-6 bg-black/50 text-white p-2 rounded-full backdrop-blur-md z-10">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
             </svg>
          </button>
       </div>
       <div className="bg-black/80 p-8 flex justify-center items-center gap-10 pb-16">
           <button onClick={takePhoto} className="w-20 h-20 rounded-full border-4 border-white p-1 flex items-center justify-center group active:scale-95 transition-transform">
              <div className="w-full h-full bg-white rounded-full group-active:bg-gray-200"></div>
           </button>
       </div>
    </div>
  );
};

// --- Digital ID Modal ---
const DigitalIDModal = ({ profile, onClose }: { profile: StudentProfile, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
       <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative transform transition-all scale-100">
          <div className="bg-ksitmb h-24 relative p-4 flex items-center gap-3">
             <img src={LOGO_URL} className="w-12 h-12 bg-white rounded-lg p-1 object-contain" />
             <div>
                <h2 className="text-white font-bold text-lg leading-tight">KSITM</h2>
                <p className="text-blue-200 text-xs uppercase tracking-wider">Student Identity Card</p>
             </div>
             <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-white/10 to-transparent transform rotate-45 translate-x-10 -translate-y-10"></div>
          </div>
          <div className="px-6 pb-6 pt-12 relative text-center">
             <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 w-24 h-24 rounded-xl border-4 border-white dark:border-slate-800 bg-gray-200 overflow-hidden shadow-md">
                <img src={profile.avatar} className="w-full h-full object-cover" />
             </div>
             <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{profile.firstName} {profile.lastName}</h2>
             <p className="text-ksitmo font-bold text-sm mb-4">{profile.matricNumber}</p>
             <div className="grid grid-cols-2 gap-4 text-left bg-gray-50 dark:bg-slate-800 p-4 rounded-xl mb-6">
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Department</p><p className="text-xs font-bold text-gray-800 dark:text-gray-200 line-clamp-2">{profile.department}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Level</p><p className="text-xs font-bold text-gray-800 dark:text-gray-200">{profile.level}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Session</p><p className="text-xs font-bold text-gray-800 dark:text-gray-200">2024/2025</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Expires</p><p className="text-xs font-bold text-red-500">Dec 2025</p></div>
             </div>
             <div className="flex flex-col items-center gap-2">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(JSON.stringify({id: profile.matricNumber, name: profile.firstName}))}`} className="w-24 h-24 mix-blend-multiply dark:mix-blend-normal dark:bg-white p-1 rounded" />
                <p className="text-[10px] text-gray-400">Scan to verify student status</p>
             </div>
          </div>
          <button onClick={onClose} className="absolute top-2 right-2 text-white/50 hover:text-white">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
       </div>
    </div>
  );
};

// --- Global Search Component ---
export const GlobalSearch = ({ isOpen, onClose, onNavigateToTutor }: { isOpen: boolean, onClose: () => void, onNavigateToTutor: () => void }) => {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    if (!query.trim()) return { courses: [], posts: [], announcements: [] };
    const q = query.toLowerCase();
    return {
      courses: MOCK_COURSES.filter(c => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)),
      posts: MOCK_POSTS.filter(p => p.content.toLowerCase().includes(q) || p.author.toLowerCase().includes(q)),
      announcements: MOCK_ANNOUNCEMENTS.filter(a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q))
    };
  }, [query]);
  
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-slate-800">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 relative">
           <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses, posts..." className="w-full bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-ksitmb dark:focus:ring-blue-500" />
           <div className="absolute left-3 top-3 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {results.courses.length > 0 && <div><h3 className="text-sm font-bold text-gray-500 mb-3">Courses</h3>{results.courses.map(c => <div key={c.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 mb-2">{c.title}</div>)}</div>}
        {results.announcements.length > 0 && <div><h3 className="text-sm font-bold text-gray-500 mb-3">Announcements</h3>{results.announcements.map(a => <div key={a.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 mb-2">{a.title}</div>)}</div>}
      </div>
    </div>
  );
};

// --- Chat Overlay ---
export const ChatOverlay = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-slate-800 sticky top-0">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h2 className="font-bold text-lg text-gray-800 dark:text-white">Messages</h2>
      </div>
      <div className="flex-1 p-4"><p className="text-center text-gray-500">No new messages</p></div>
    </div>
  );
};

// --- Live Study Room View ---
export const StudyRoomView = ({ room, onClose }: { room: StudyRoom, onClose: () => void }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('clientX' in e ? e.clientX : e.touches[0].clientX) - rect.left;
    const y = ('clientY' in e ? e.clientY : e.touches[0].clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  return (
     <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-in fade-in">
        <div className="bg-slate-800 p-4 flex justify-between items-center text-white">
           <div><h2 className="font-bold">{room.title}</h2><p className="text-xs text-slate-400">{room.participants} Online • {room.host}</p></div>
           <button onClick={onClose} className="bg-red-500/20 text-red-500 px-4 py-2 rounded-full text-xs font-bold">Leave</button>
        </div>
        <div className="flex-1 bg-white relative">
           <canvas 
             ref={canvasRef} 
             className="w-full h-full touch-none"
             width={window.innerWidth}
             height={window.innerHeight - 150}
             onMouseDown={() => setIsDrawing(true)}
             onMouseUp={() => { setIsDrawing(false); canvasRef.current?.getContext('2d')?.beginPath(); }}
             onMouseMove={draw}
             onTouchStart={() => setIsDrawing(true)}
             onTouchEnd={() => { setIsDrawing(false); canvasRef.current?.getContext('2d')?.beginPath(); }}
             onTouchMove={draw}
           />
           <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded">Whiteboard Active</div>
        </div>
     </div>
  );
};

// --- Role Selection View ---
export const RoleSelectionView = ({ onSelectRole }: { onSelectRole: (role: UserRole) => void }) => {
  const [showVerification, setShowVerification] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode === ADMIN_VERIFICATION_CODE) {
      onSelectRole('admin');
    } else {
      setErrorMsg('Access Denied. Redirecting to Student Portal...');
      // Short delay to show error before redirecting
      setTimeout(() => {
        onSelectRole('student');
      }, 1500);
    }
  };

  if (showVerification) {
     return (
        <div className="flex flex-col items-center justify-center h-screen bg-ksitmb text-white p-6 animate-in fade-in">
           <div className="w-full max-w-sm">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl shadow-2xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-20 h-20 bg-ksitmo/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
                 
                 <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-3xl mb-3 border border-white/10">
                       🔒
                    </div>
                    <h2 className="text-xl font-bold">Staff Verification</h2>
                    <p className="text-sm text-blue-200 text-center mt-1">Enter your staff access code to continue.</p>
                 </div>

                 <form onSubmit={handleVerify} className="space-y-4">
                    <div>
                        <input 
                            type="text" 
                            autoFocus
                            value={accessCode}
                            onChange={(e) => { setAccessCode(e.target.value); setErrorMsg(''); }}
                            placeholder="Enter Code (STF-...)" 
                            className={`w-full bg-black/40 border ${errorMsg ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-ksitmo transition-all font-mono tracking-wider text-center uppercase`}
                        />
                        {errorMsg && <p className="text-xs text-red-500 mt-2 font-bold text-center animate-pulse">{errorMsg}</p>}
                    </div>

                    <button 
                        type="submit"
                        className="w-full bg-ksitmo text-white font-bold py-3 rounded-xl shadow-lg hover:bg-orange-600 transition-all active:scale-95"
                    >
                        Verify Access
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => { setShowVerification(false); setAccessCode(''); setErrorMsg(''); }}
                        className="w-full text-xs text-gray-400 hover:text-white py-2"
                    >
                        Cancel
                    </button>
                 </form>
              </div>
           </div>
        </div>
     );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-ksitmb text-white p-6 animate-in fade-in duration-500">
      <div className="mb-10 text-center">
        <img src={LOGO_URL} alt="KSITM Logo" className="w-24 h-24 mx-auto mb-4 bg-white rounded-xl p-1 shadow-lg border-2 border-white/20" />
        <h1 className="text-2xl font-bold tracking-tight">Welcome to KSITM</h1>
        <p className="text-blue-200 mt-2">Select your portal to continue</p>
      </div>
      
      <div className="w-full max-w-xs space-y-4">
        <button onClick={() => onSelectRole('student')} className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4 transition-all group">
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform">👨‍🎓</div>
          <div className="text-left">
            <h3 className="font-bold text-lg">Student Portal</h3>
            <p className="text-xs text-blue-200">Access LMS, Results & Community</p>
          </div>
        </button>

        <button onClick={() => setShowVerification(true)} className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4 transition-all group">
          <div className="w-12 h-12 bg-ksitmo rounded-full flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform">👔</div>
          <div className="text-left">
            <h3 className="font-bold text-lg">Staff Portal</h3>
            <p className="text-xs text-blue-200">Manage Courses & Assignments</p>
          </div>
        </button>
      </div>
      
      <p className="mt-12 text-xs text-blue-400/50">Version 2.5.0 • Katsina State Institute of Technology & Management</p>
    </div>
  );
};

// --- Auth View (Registration & Login) ---
export const AuthView = ({ role, onAuthComplete }: { role: UserRole, onAuthComplete: (data: any) => void }) => {
  // Step 1: Basic Info, Step 2: Verification, Step 3: Username/DOB
  const [step, setStep] = useState(1);
  const [isRegistering, setIsRegistering] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form Data
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    matricNumber: '',
    department: '',
    level: 'ND I',
    staffId: '',
    avatar: '',
    dateOfBirth: '',
    username: '',
    isHOD: false, // New Field
  });

  // Username Logic
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const takenUsernames = ['admin', 'test', 'user', 'ksitm', 'root'];

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setFormData({...formData, username: val});
    
    if (val.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    setTimeout(() => {
       if (takenUsernames.includes(val)) {
         setUsernameStatus('taken');
       } else {
         setUsernameStatus('available');
       }
    }, 500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, avatar: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRegisterStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.department) {
        alert("Please fill all fields");
        return;
    }
    // Simulate Email Verification
    setLoading(true);
    setTimeout(() => {
        setLoading(false);
        setStep(2); // Go to Verification/DOB step
    }, 1500);
  };

  const handleRegisterStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'student') {
        if (usernameStatus === 'taken') return;
        if (!formData.dateOfBirth || !formData.username) return;
    }
    
    setLoading(true);
    setTimeout(() => {
      onAuthComplete(formData);
    }, 1000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      // Simulate fetching user data based on role
      const loginData = role === 'student' ? {
        firstName: 'Usman',
        lastName: 'Abdullahi',
        email: formData.email,
        matricNumber: 'KSITM/CS/23/045',
        department: 'Computer Science',
        level: 'ND II',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Usman',
        username: 'usman_codes',
        dateOfBirth: '2000-01-01'
      } : {
        firstName: 'Aminu',
        lastName: 'Kano',
        email: formData.email,
        department: 'Computer Science', // Mock department if not provided
        staffId: 'KSITM/STAFF/001',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aminu',
        isHOD: formData.email.includes('hod') // simple mock logic for login
      };
      onAuthComplete(loginData);
    }, 1500);
  };

  if (showCamera) {
    return (
      <CameraCapture 
        onCapture={(img) => {
            setFormData({...formData, avatar: img});
            setShowCamera(false);
        }} 
        onClose={() => setShowCamera(false)}
        overlayText="Take Profile Photo"
      />
    );
  }

  // --- Step 2: Verification, DOB, Username (Student) OR Just Finish (Admin) ---
  if (isRegistering && step === 2) {
    return (
      <div className="min-h-screen bg-ksitmb text-white p-6 flex flex-col items-center justify-center animate-in slide-in-from-right">
        <div className="w-full max-w-sm">
           <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl shadow-[0_0_20px_rgba(34,197,94,0.5)]">✓</div>
              <h2 className="text-xl font-bold">Email Verified</h2>
              <p className="text-blue-200 text-sm mt-1">Please complete your profile.</p>
           </div>
           
           <form onSubmit={handleRegisterStep2} className="space-y-5">
              {role === 'student' ? (
                 <>
                    <div>
                        <label className="block text-xs font-bold text-blue-300 uppercase mb-1">Date of Birth</label>
                        <input 
                        type="date" 
                        required
                        value={formData.dateOfBirth}
                        onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-ksitmo focus:ring-1 focus:ring-ksitmo outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-blue-300 uppercase mb-1">Choose Username</label>
                        <div className="relative">
                            <input 
                            type="text" 
                            required
                            value={formData.username}
                            onChange={handleUsernameChange}
                            placeholder="unique_username"
                            className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white outline-none ${usernameStatus === 'taken' ? 'border-red-500 focus:border-red-500' : usernameStatus === 'available' ? 'border-green-500 focus:border-green-500' : 'border-white/10 focus:border-ksitmo'}`}
                            />
                            <div className="absolute right-3 top-3.5">
                            {usernameStatus === 'checking' && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>}
                            {usernameStatus === 'available' && <span className="text-green-500 text-xs font-bold">Available</span>}
                            {usernameStatus === 'taken' && <span className="text-red-500 text-xs font-bold">Not Available</span>}
                            </div>
                        </div>
                    </div>
                 </>
              ) : (
                <p className="text-center text-gray-300">Staff profile ready to be created.</p>
              )}

              <button 
                type="submit" 
                disabled={loading || (role === 'student' && usernameStatus === 'taken')}
                className="w-full bg-ksitmo text-white font-bold py-4 rounded-xl shadow-lg hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Profile...' : 'Complete Registration'}
              </button>
           </form>
        </div>
      </div>
    );
  }

  // --- Step 1 / Login ---
  return (
    <div className="min-h-screen bg-ksitmb text-white p-6 flex flex-col justify-center overflow-y-auto">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex justify-center mb-6">
           <img src={LOGO_URL} className="w-20 h-20 bg-white rounded-xl p-1 shadow-lg" alt="KSITM" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">
          {isRegistering ? `Create ${role === 'student' ? 'Student' : 'Staff'} Account` : 'Welcome Back'}
        </h2>
        <p className="text-center text-blue-200 text-sm mb-8">
          {isRegistering ? 'Enter your details to get started' : 'Sign in to access your dashboard'}
        </p>

        <form onSubmit={isRegistering ? handleRegisterStep1 : handleLogin} className="space-y-4">
          {isRegistering && (
            <>
              <div className="flex justify-center mb-4">
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileUpload}
                 />
                 <div className="relative group cursor-pointer">
                    <div 
                      className="w-24 h-24 rounded-full bg-white/10 border-2 border-dashed border-white/30 flex items-center justify-center overflow-hidden hover:bg-white/20 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                       {formData.avatar ? (
                          <img src={formData.avatar} className="w-full h-full object-cover" />
                       ) : (
                          <span className="text-4xl opacity-50">🖼️</span>
                       )}
                    </div>
                    <div 
                      className="absolute bottom-0 right-0 bg-ksitmo p-2 rounded-full shadow-md z-10 hover:scale-110 transition-transform"
                      onClick={(e) => {
                         e.stopPropagation();
                         setShowCamera(true);
                      }}
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                 </div>
              </div>
              <p className="text-xs text-blue-200 -mt-2 mb-4 text-center">Tap icon to upload or button for camera</p>

              <div className="grid grid-cols-2 gap-3">
                <input required placeholder="First Name" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none" />
                <input required placeholder="Last Name" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none" />
              </div>
              
              {/* Student Registration Fields */}
              {role === 'student' && (
                <>
                  <input required placeholder="Matric Number" value={formData.matricNumber} onChange={e => setFormData({...formData, matricNumber: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none" />
                  <select required value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-ksitmo outline-none appearance-none">
                    <option value="" className="text-gray-900">Select Department</option>
                    {Object.keys(KSITM_COURSES_DATA).map(cat => (
                        <optgroup key={cat} label={cat} className="text-gray-900">
                            {KSITM_COURSES_DATA[cat].map(dept => <option key={dept} value={dept}>{dept}</option>)}
                        </optgroup>
                    ))}
                  </select>
                  <select required value={formData.level} onChange={e => setFormData({...formData, level: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-ksitmo outline-none appearance-none">
                     <option value="ND I" className="text-gray-900">ND I</option>
                     <option value="ND II" className="text-gray-900">ND II</option>
                     <option value="NID I" className="text-gray-900">NID I</option>
                     <option value="NID II" className="text-gray-900">NID II</option>
                  </select>
                </>
              )}

              {/* Admin Registration Fields */}
              {role === 'admin' && (
                <>
                   <input required placeholder="Staff ID Code" value={formData.staffId} onChange={e => setFormData({...formData, staffId: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none" />
                   
                   {/* HOD Selection Logic */}
                   <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10">
                      <input 
                        type="checkbox" 
                        id="isHOD" 
                        checked={formData.isHOD} 
                        onChange={e => setFormData({...formData, isHOD: e.target.checked})}
                        className="w-5 h-5 accent-ksitmo"
                      />
                      <label htmlFor="isHOD" className="text-sm text-gray-200">Are you a Head of Department (HOD)?</label>
                   </div>

                   {formData.isHOD && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="text-xs text-blue-300 ml-1 mb-1 block">Select Department to Manage</label>
                        <select required value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-ksitmo outline-none appearance-none">
                            <option value="" className="text-gray-900">Select Department</option>
                            {Object.keys(KSITM_COURSES_DATA).map(cat => (
                                <optgroup key={cat} label={cat} className="text-gray-900">
                                    {KSITM_COURSES_DATA[cat].map(dept => <option key={dept} value={dept}>{dept}</option>)}
                                </optgroup>
                            ))}
                        </select>
                      </div>
                   )}
                </>
              )}
            </>
          )}

          <input type="email" required placeholder="School Email (...@ksitm.edu.ng)" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none" />
          <input type="password" required placeholder="Password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none" />
          
          <button type="submit" disabled={loading} className="w-full bg-ksitmo text-white font-bold py-3.5 rounded-lg shadow-lg hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-70 mt-4">
             {loading ? (isRegistering ? 'Verifying...' : 'Signing in...') : (isRegistering ? 'Next' : 'Sign In')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={() => { setIsRegistering(!isRegistering); setStep(1); }} className="text-sm text-blue-200 hover:text-white underline">
            {isRegistering ? 'Already have an account? Sign In' : 'New here? Create Account'}
          </button>
        </div>
        
        <button onClick={() => window.location.reload()} className="mt-8 text-xs text-white/30 hover:text-white/50 w-full text-center">
           Change Role
        </button>
      </div>
    </div>
  );
};

// --- Student Dashboard ---
export const StudentDashboard = ({ profile, onNavigate }: { profile: StudentProfile, onNavigate: (tab: AppTab) => void }) => {
  const [showID, setShowID] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  return (
    <div className="p-4 pb-20 space-y-6 animate-in fade-in duration-500">
      {/* Header with Profile Pic */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="relative">
             <img src={profile.avatar} alt="Profile" className="w-14 h-14 rounded-full border-2 border-white dark:border-slate-700 shadow-md object-cover" />
             <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
          </div>
          <div>
             <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Hi, {profile.firstName}</h1>
             <p className="text-sm text-gray-500 dark:text-gray-400">{profile.department} • {profile.matricNumber}</p>
          </div>
        </div>
        <button onClick={() => setShowID(true)} className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 active:scale-95 transition-transform">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-ksitmb dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
        </button>
      </div>

      {showID && <DigitalIDModal profile={profile} onClose={() => setShowID(false)} />}
      
      {showScanner && (
         <CameraCapture 
            onCapture={() => { alert("Attendance Marked Successfully!"); setShowScanner(false); }} 
            onClose={() => setShowScanner(false)} 
            overlayText="Scan Class QR"
         />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50 dark:bg-slate-800/50 border-blue-100 dark:border-slate-700">
          <div className="text-blue-600 dark:text-blue-400 font-bold text-lg">{profile.gpa.toFixed(2)}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">CGPA</div>
        </Card>
        <Card className="bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/20">
          <div className="text-orange-600 dark:text-orange-400 font-bold text-lg">{profile.streak} 🔥</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Streak</div>
        </Card>
        <Card className="bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/20 col-span-1">
           <div className="text-purple-600 dark:text-purple-400 font-bold text-xs line-clamp-2">{profile.timetable}</div>
           <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mt-1">Next Class</div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
         <SectionHeader title="Quick Actions" />
         <div className="grid grid-cols-4 gap-4">
            <button onClick={() => setShowScanner(true)} className="flex flex-col items-center gap-2 group">
               <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700 group-active:scale-95 transition-all text-2xl">📷</div>
               <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Attendance</span>
            </button>
            <button onClick={() => onNavigate(AppTab.LMS)} className="flex flex-col items-center gap-2 group">
               <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700 group-active:scale-95 transition-all text-2xl">📚</div>
               <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Courses</span>
            </button>
            <button onClick={() => onNavigate(AppTab.ASSIGNMENTS)} className="flex flex-col items-center gap-2 group">
               <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700 group-active:scale-95 transition-all text-2xl">📝</div>
               <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Tasks</span>
            </button>
            <button onClick={() => onNavigate(AppTab.AI_TUTOR)} className="flex flex-col items-center gap-2 group">
               <div className="w-14 h-14 bg-gradient-to-br from-ksitmb to-blue-900 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20 group-active:scale-95 transition-all text-2xl">🤖</div>
               <span className="text-[10px] font-bold text-ksitmb dark:text-blue-400">AI Tutor</span>
            </button>
         </div>
      </div>

      {/* Recent Activity */}
      <SectionHeader title="Latest Updates" action="View All" />
      <div className="space-y-3">
        {MOCK_ANNOUNCEMENTS.map(announcement => (
          <Card key={announcement.id}>
            <div className="flex gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${announcement.type === 'academic' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                {announcement.type === 'academic' ? '🎓' : '📢'}
              </div>
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm">{announcement.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{announcement.content}</p>
                <p className="text-[10px] text-gray-400 mt-2">{announcement.date}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// --- Assignments View ---
export const AssignmentsView = ({ userRole, profile, onNavigate }: { userRole: UserRole, profile: any, onNavigate: (tab: AppTab) => void }) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted' | 'create'>('pending');
  // Form State for Admin
  const [newAssignment, setNewAssignment] = useState({
     courseId: '',
     title: '',
     description: '',
     deadlineDate: '',
     deadlineTime: ''
  });
  const [generatingDesc, setGeneratingDesc] = useState(false);

  const generateAIDescription = async () => {
    if (!newAssignment.title || !newAssignment.courseId) return;
    setGeneratingDesc(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Write a short, professional assignment description for a course "${newAssignment.courseId}" with the title "${newAssignment.title}". Target polytechnic students.`,
        });
        setNewAssignment(prev => ({...prev, description: response.text || prev.description}));
    } catch (e) {
        console.error("AI Gen Error", e);
    } finally {
        setGeneratingDesc(false);
    }
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
       <SectionHeader title={userRole === 'admin' ? "Manage Assignments" : "My Assignments"} />
       
       <div className="flex gap-2 border-b border-gray-200 dark:border-slate-800 pb-2 mb-4 overflow-x-auto">
          {userRole === 'admin' ? (
             <>
                <button onClick={() => setActiveTab('pending')} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${activeTab === 'pending' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}>Active Tasks</button>
                <button onClick={() => setActiveTab('create')} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${activeTab === 'create' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}>Create New</button>
             </>
          ) : (
             <>
                <button onClick={() => setActiveTab('pending')} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${activeTab === 'pending' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}>Pending</button>
                <button onClick={() => setActiveTab('submitted')} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${activeTab === 'submitted' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}>Submitted</button>
             </>
          )}
       </div>

       {activeTab === 'create' && userRole === 'admin' && (
          <Card className="space-y-4">
             <h3 className="font-bold text-gray-800 dark:text-white">Create Assignment</h3>
             <div className="space-y-3">
                <select 
                   className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 text-sm dark:text-white"
                   value={newAssignment.courseId}
                   onChange={e => setNewAssignment({...newAssignment, courseId: e.target.value})}
                >
                   <option value="">Select Course</option>
                   <option value="COM 311">COM 311 - Operating Systems II</option>
                   <option value="COM 312">COM 312 - Database Design I</option>
                   <option value="GNS 301">GNS 301 - Use of English III</option>
                </select>
                
                <input 
                   placeholder="Assignment Title"
                   className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 text-sm dark:text-white"
                   value={newAssignment.title}
                   onChange={e => setNewAssignment({...newAssignment, title: e.target.value})}
                />
                
                <div className="relative">
                   <textarea 
                      placeholder="Description & Instructions"
                      rows={4}
                      className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 text-sm dark:text-white"
                      value={newAssignment.description}
                      onChange={e => setNewAssignment({...newAssignment, description: e.target.value})}
                   />
                   <button 
                      onClick={generateAIDescription}
                      disabled={generatingDesc || !newAssignment.title}
                      className="absolute bottom-2 right-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md flex items-center gap-1 hover:bg-blue-200"
                   >
                      {generatingDesc ? 'Generating...' : '✨ AI Generate'}
                   </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                   <input type="date" className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 text-sm dark:text-white" />
                   <input type="time" className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 text-sm dark:text-white" />
                </div>
                
                <button className="w-full bg-ksitmb text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-900 transition-colors">
                   Publish Assignment
                </button>
             </div>
          </Card>
       )}

       {activeTab === 'pending' && (
          <div className="space-y-3">
             {MOCK_ASSIGNMENTS.map(assign => (
                <Card key={assign.id}>
                   <div className="flex justify-between items-start mb-2">
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded">{assign.courseId}</span>
                      <span className="text-[10px] text-red-500 font-bold">Due {new Date(assign.deadline).toLocaleDateString()}</span>
                   </div>
                   <h3 className="font-bold text-gray-800 dark:text-white text-sm">{assign.title}</h3>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{assign.description}</p>
                   {userRole === 'student' && (
                      <button className="w-full mt-3 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 text-xs font-bold py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600">
                         Upload Submission
                      </button>
                   )}
                </Card>
             ))}
          </div>
       )}
    </div>
  );
};

// --- Admin Dashboard ---
export const AdminDashboard = ({ profile, onNavigate }: { profile: AdminProfile, onNavigate: (tab: AppTab) => void }) => {
   // Filter students for HOD view
   const departmentStudents = useMemo(() => {
     if (!profile.isHOD) return [];
     return MOCK_ALL_STUDENTS.filter(s => s.department === profile.department);
   }, [profile.isHOD, profile.department]);

   return (
      <div className="p-4 pb-20 space-y-6">
         <div className="flex items-center gap-3 mb-6">
            <div className="relative">
              <img src={profile.avatar} className="w-14 h-14 rounded-full border-2 border-white dark:border-slate-700 shadow-md" />
              {profile.isHOD && (
                <span className="absolute -bottom-1 -right-1 bg-ksitmo text-white text-[9px] font-bold px-2 py-0.5 rounded-full border border-white">HOD</span>
              )}
            </div>
            <div>
               <h1 className="text-xl font-bold text-gray-800 dark:text-white">{profile.isHOD ? 'HOD Dashboard' : 'Lecturer Dashboard'}</h1>
               <p className="text-sm text-gray-500">{profile.firstName} {profile.lastName}</p>
               {profile.isHOD && <p className="text-xs text-blue-500 font-bold">{profile.department}</p>}
            </div>
         </div>

         <div className="grid grid-cols-2 gap-3">
            <Card className="bg-blue-50 dark:bg-slate-800">
               <h3 className="text-blue-600 dark:text-blue-400 font-bold text-2xl">{profile.isHOD ? departmentStudents.length : 4}</h3>
               <p className="text-xs text-gray-500 font-bold uppercase">{profile.isHOD ? 'Dept. Students' : 'Active Courses'}</p>
            </Card>
            <Card className="bg-green-50 dark:bg-slate-800">
               <h3 className="text-green-600 dark:text-green-400 font-bold text-2xl">120</h3>
               <p className="text-xs text-gray-500 font-bold uppercase">Total Enrolled</p>
            </Card>
         </div>

         {/* HOD Specific View: Student List */}
         {profile.isHOD && (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              <SectionHeader title={`Students in ${profile.department}`} />
              <div className="space-y-3">
                {departmentStudents.length > 0 ? (
                  departmentStudents.map(student => (
                    <Card key={student.matricNumber} className="flex items-center gap-3">
                       <img src={student.avatar} className="w-10 h-10 rounded-full bg-gray-200" />
                       <div className="flex-1">
                          <h4 className="font-bold text-sm text-gray-800 dark:text-white">{student.firstName} {student.lastName}</h4>
                          <p className="text-xs text-gray-500">{student.matricNumber} • {student.level}</p>
                       </div>
                       <div className="text-right">
                          <span className="block text-xs font-bold text-blue-600">{student.gpa.toFixed(2)} GPA</span>
                       </div>
                    </Card>
                  ))
                ) : (
                  <p className="text-center text-gray-400 text-sm py-4">No students found in this department.</p>
                )}
              </div>
            </div>
         )}

         {/* Non-HOD (Lecturer) View: Course Tasks */}
         {!profile.isHOD && (
            <>
              <SectionHeader title="Pending Approvals" />
              <div className="space-y-3">
                  {MOCK_PENDING_CONTENT.map(content => (
                    <Card key={content.id} className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-xl">⏳</div>
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-gray-800 dark:text-white">{content.title}</h4>
                          <p className="text-xs text-gray-500">{content.type} • {content.author}</p>
                        </div>
                        <button className="px-3 py-1 bg-ksitmb text-white text-xs rounded-lg">Review</button>
                    </Card>
                  ))}
              </div>
            </>
         )}
         
         <div className="grid grid-cols-2 gap-4">
             <button onClick={() => onNavigate(AppTab.ASSIGNMENTS)} className="bg-ksitmb text-white p-4 rounded-xl shadow-lg flex flex-col items-center">
                <span className="text-2xl mb-1">📝</span>
                <span className="text-xs font-bold">New Assignment</span>
             </button>
              <button className="bg-white dark:bg-slate-800 border dark:border-slate-700 p-4 rounded-xl shadow-sm flex flex-col items-center">
                <span className="text-2xl mb-1">📢</span>
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Announce</span>
             </button>
         </div>
      </div>
   );
};

// --- LMS View ---
export const LMSView = ({ onNavigate }: { onNavigate: (tab: AppTab) => void }) => (
  <div className="p-4 space-y-4 animate-in fade-in">
    <SectionHeader title="My Courses" />
    <div className="grid gap-4">
      {MOCK_COURSES.map(course => (
        <Card key={course.id} onClick={() => {}}>
          <div className="flex justify-between items-start mb-3">
             <div>
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded">{course.code}</span>
                <h3 className="font-bold text-gray-800 dark:text-white mt-2">{course.title}</h3>
             </div>
             <div className="text-right">
                <span className="text-xs text-gray-500 dark:text-gray-400">Progress</span>
                <p className="font-bold text-ksitmb dark:text-blue-400">{course.progress}%</p>
             </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 mb-4">
            <div className="bg-ksitmb dark:bg-blue-500 h-1.5 rounded-full" style={{ width: `${course.progress}%` }}></div>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
             <span>Next: {course.nextClass}</span>
             <button className="text-ksitmo hover:underline font-bold">View Materials</button>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

// --- Community View ---
export const CommunityContainer = ({ profile, onJoinRoom }: { profile: any, onJoinRoom: (r: StudyRoom) => void }) => {
  const [activeTab, setActiveTab] = useState<'feed' | 'groups' | 'hub'>('feed');
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [newPostText, setNewPostText] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [postImage, setPostImage] = useState<string | null>(null);

  const handleLike = (postId: string) => {
     setPosts(prev => prev.map(p => {
        if (p.id === postId) {
           return { ...p, likes: p.liked ? p.likes - 1 : p.likes + 1, liked: !p.liked };
        }
        return p;
     }));
  };

  const handlePost = () => {
     if (!newPostText.trim() && !postImage) return;
     const newPost: Post = {
        id: Date.now().toString(),
        author: `${profile.firstName} ${profile.lastName}`,
        avatar: profile.avatar,
        time: 'Just now',
        content: newPostText,
        likes: 0,
        comments: 0,
        image: postImage || undefined,
        liked: false
     };
     setPosts([newPost, ...posts]);
     setNewPostText('');
     setPostImage(null);
  };

  if (showCamera) {
     return <CameraCapture onCapture={(img) => { setPostImage(img); setShowCamera(false); }} onClose={() => setShowCamera(false)} overlayText="Snap for Community" />;
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="flex border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10 px-4 pt-2">
         {['feed', 'groups', 'hub'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 pb-3 text-sm font-bold capitalize ${activeTab === tab ? 'text-ksitmb dark:text-blue-400 border-b-2 border-ksitmb dark:border-blue-400' : 'text-gray-400'}`}
            >
              {tab === 'hub' ? 'Innovation Hub' : tab}
            </button>
         ))}
      </div>

      <div className="p-4 space-y-4 pb-20">
         {activeTab === 'feed' && (
            <>
               {/* Create Post */}
               <Card className="mb-4">
                  <div className="flex gap-3 mb-3">
                     <img src={profile.avatar} className="w-10 h-10 rounded-full bg-gray-200" />
                     <textarea 
                        value={newPostText}
                        onChange={e => setNewPostText(e.target.value)}
                        placeholder="What's happening on campus?" 
                        className="flex-1 bg-gray-50 dark:bg-slate-900 rounded-lg p-3 text-sm resize-none outline-none dark:text-white"
                        rows={2}
                     />
                  </div>
                  {postImage && (
                     <div className="relative mb-3">
                        <img src={postImage} className="w-full h-40 object-cover rounded-lg" />
                        <button onClick={() => setPostImage(null)} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1">✕</button>
                     </div>
                  )}
                  <div className="flex justify-between items-center">
                     <button onClick={() => setShowCamera(true)} className="text-ksitmb dark:text-blue-400 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                     </button>
                     <button 
                        onClick={handlePost}
                        disabled={!newPostText.trim() && !postImage}
                        className="bg-ksitmb text-white px-4 py-1.5 rounded-full text-sm font-bold disabled:opacity-50"
                     >
                        Post
                     </button>
                  </div>
               </Card>

               {posts.map(post => (
                  <Card key={post.id}>
                     <div className="flex gap-3 mb-3">
                        <img src={post.avatar} className="w-10 h-10 rounded-full bg-gray-200" />
                        <div>
                           <h4 className="font-bold text-gray-800 dark:text-white text-sm">{post.author}</h4>
                           <p className="text-xs text-gray-400">{post.time}</p>
                        </div>
                     </div>
                     <p className="text-sm text-gray-800 dark:text-gray-200 mb-3 whitespace-pre-wrap">{post.content}</p>
                     {post.image && <img src={post.image} className="w-full h-48 object-cover rounded-lg mb-3" />}
                     <div className="flex gap-6 border-t border-gray-100 dark:border-slate-700 pt-3">
                        <button 
                           onClick={() => handleLike(post.id)}
                           className={`flex items-center gap-1.5 text-xs font-bold ${post.liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill={post.liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                           {post.likes}
                        </button>
                        <button className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                           {post.comments}
                        </button>
                     </div>
                  </Card>
               ))}
            </>
         )}

         {activeTab === 'groups' && (
            <div className="space-y-4">
               <SectionHeader title="Study Rooms (Live)" action="Create Room" />
               <div className="grid grid-cols-2 gap-3 mb-6">
                  {MOCK_STUDY_ROOMS.map(room => (
                     <div key={room.id} onClick={() => onJoinRoom(room)} className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-3 rounded-xl cursor-pointer shadow-lg hover:scale-105 transition-transform">
                        <div className="flex justify-between items-start">
                           <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold">LIVE</span>
                           <span className="text-xs">👥 {room.participants}</span>
                        </div>
                        <h3 className="font-bold mt-2 text-sm">{room.title}</h3>
                        <p className="text-[10px] opacity-80 mt-1">{room.host}</p>
                     </div>
                  ))}
               </div>

               <SectionHeader title="Your Communities" />
               {MOCK_COMMUNITIES.map(comm => (
                  <Card key={comm.id} className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl">{comm.icon}</div>
                     <div className="flex-1">
                        <h4 className="font-bold text-gray-800 dark:text-white">{comm.name}</h4>
                        <p className="text-xs text-gray-500 line-clamp-1">{comm.description}</p>
                     </div>
                     <button className="bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-4 py-1.5 rounded-full text-xs font-bold">View</button>
                  </Card>
               ))}
            </div>
         )}
         
         {activeTab === 'hub' && (
             <div className="space-y-4">
               <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-4 text-white shadow-lg">
                  <h3 className="font-bold text-lg">KSITM Innovation Hub 🚀</h3>
                  <p className="text-sm opacity-90 mb-3">Showcase your projects and get funding!</p>
                  <button className="bg-white text-orange-600 px-4 py-2 rounded-lg text-xs font-bold">Submit Project</button>
               </div>
               
               {MOCK_PROJECTS.map(proj => (
                  <Card key={proj.id}>
                     <div className="flex justify-between mb-2">
                        <span className="text-xs font-bold text-orange-500 uppercase tracking-wide">{proj.category}</span>
                        <div className="flex items-center gap-1 text-gray-500 text-xs">
                           <span>⭐</span> {proj.votes}
                        </div>
                     </div>
                     <h3 className="font-bold text-gray-800 dark:text-white">{proj.title}</h3>
                     <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-3">{proj.description}</p>
                     <div className="flex justify-between items-center border-t border-gray-100 dark:border-slate-700 pt-2">
                        <span className="text-xs font-medium text-gray-500">by {proj.student}</span>
                        <button className="text-ksitmb dark:text-blue-400 text-xs font-bold">Vote</button>
                     </div>
                  </Card>
               ))}
             </div>
         )}
      </div>
    </div>
  );
};

// --- Profile View ---
export const ProfileView = ({ profile, isDarkMode, toggleDarkMode }: { profile: any, isDarkMode: boolean, toggleDarkMode: () => void }) => (
  <div className="p-4 space-y-4 pb-20 animate-in fade-in">
    <div className="text-center py-6">
       <div className="relative inline-block">
          <img src={profile.avatar} className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-700 shadow-lg mx-auto bg-gray-200" />
          <div className="absolute bottom-1 right-1 bg-green-500 w-5 h-5 border-2 border-white dark:border-slate-800 rounded-full"></div>
       </div>
       <h2 className="text-xl font-bold mt-3 text-gray-800 dark:text-white">{profile.firstName} {profile.lastName}</h2>
       <p className="text-sm text-gray-500 dark:text-gray-400">{profile.role === 'student' ? profile.matricNumber : profile.staffId}</p>
       {profile.role === 'student' && <p className="text-xs text-blue-500 mt-1">{profile.department}</p>}
    </div>

    <Card className="space-y-1 divide-y divide-gray-100 dark:divide-slate-700">
       <div className="flex justify-between items-center py-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Dark Mode</span>
          <button onClick={toggleDarkMode} className={`w-12 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-ksitmb' : 'bg-gray-300'}`}>
             <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${isDarkMode ? 'translate-x-6' : ''}`}></div>
          </button>
       </div>
       <div className="flex justify-between items-center py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Notifications</span>
          <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">3</span>
       </div>
       <div className="flex justify-between items-center py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Account Settings</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
       </div>
    </Card>

    <button onClick={() => window.location.reload()} className="w-full bg-red-50 text-red-600 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors">
       Sign Out
    </button>
    
    <div className="text-center mt-8">
       <img src={LOGO_URL} className="w-8 h-8 mx-auto opacity-50 grayscale" />
       <p className="text-[10px] text-gray-400 mt-2">KSITM Super App v1.0.0</p>
    </div>
  </div>
);