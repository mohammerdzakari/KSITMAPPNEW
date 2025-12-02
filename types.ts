
export enum AppTab {
  HOME = 'HOME',
  LMS = 'LMS',
  ASSIGNMENTS = 'ASSIGNMENTS', // New Tab
  AI_TUTOR = 'AI_TUTOR',
  COMMUNITY = 'COMMUNITY', // Contains Social, Groups, Hub
  PROFILE = 'PROFILE',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
}

export type UserRole = 'student' | 'admin';

export interface StudentProfile {
  firstName: string;
  lastName: string;
  matricNumber: string;
  department: string;
  level: string;
  gpa: number;
  avatar: string;
  email: string;
  phone: string;
  role: 'student';
  streak: number;
  timetable: string;
  notifications: number;
  results?: string; // Added for completeness based on prompt
  dateOfBirth?: string;
  username?: string;
}

export interface AdminProfile {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  avatar: string;
  role: 'admin';
  staffId: string;
  isHOD?: boolean; // New field for Head of Department logic
}

export interface Announcement {
  id: string;
  title: string;
  date: string;
  content: string;
  type: 'academic' | 'general' | 'urgent';
}

export interface Course {
  id: string;
  code: string;
  title: string;
  progress: number;
  topics: string[];
  nextClass?: string;
}

export interface Post {
  id: string;
  author: string;
  time: string;
  content: string;
  likes: number;
  comments: number;
  image?: string;
  avatar: string;
  liked?: boolean;
}

export interface HubProject {
  id: string;
  title: string;
  student: string;
  category: string;
  description: string;
  votes: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean;
}

export interface CommunityChannel {
  id: string;
  name: string;
  members: number;
  icon: string;
  description: string;
}

export interface PendingContent {
  id: string;
  title: string;
  author: string;
  type: 'Course Material' | 'Announcement' | 'Project';
  date: string;
  status: 'pending';
  details: string;
}

export interface ChatSession {
  id: string;
  partnerName: string;
  partnerAvatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  isGroup?: boolean;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export interface StudyRoom {
  id: string;
  title: string;
  host: string;
  participants: number;
  topic: string;
  isActive: boolean;
}

// --- Assignment System Types ---

export interface Assignment {
  id: string;
  courseId: string; // e.g., 'COM 311'
  department: string;
  level: string;
  title: string;
  description: string;
  fileUrl?: string;
  deadline: number; // timestamp
  createdBy: string; // Lecturer ID/Name
  createdAt: number;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string; // Denormalized for easier display
  studentMatric: string;
  fileUrl: string;
  submittedAt: number;
  isLate: boolean;
  score?: number; // 0-100
  remark?: string;
  gradedBy?: string;
  gradedAt?: number;
  status: 'submitted' | 'graded';
}