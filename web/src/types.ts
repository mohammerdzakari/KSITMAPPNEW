/** Shapes returned by the KSITM API (see server/src/routes). */

export type UserRole = 'student' | 'lecturer' | 'hod' | 'admin';
export type Portal = 'student' | 'staff';

export interface StudentPayload {
  userId: string;
  username: string | null;
  matricNumber: string;
  departmentId: string;
  department: string;
  category: string;
  level: string;
  dateOfBirth: string | null;
  cgpa: number;
  resultsCount: number;
  streak: number;
  nextClass: string | null;
  enrolledCourses: number;
  sessionLabel: string;
}

export interface StaffPayload {
  userId: string;
  staffId: string;
  departmentId: string | null;
  department: string | null;
  category: string | null;
  hodRequestedAt: string | null;
}

export interface ApiUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  avatarFileId: string | null;
  phone: string | null;
  isActive: boolean;
  isHOD: boolean;
  createdAt: string;
  unreadNotifications: number;
  student?: StudentPayload;
  staff?: StaffPayload;
}

export interface Department {
  id: string;
  name: string;
  category: string;
}

export interface CourseSummary {
  id: string;
  code: string;
  title: string;
  level: string;
  creditUnits: number;
  description: string;
  topicCount?: number;
  completedCount?: number;
  assignmentCount?: number;
  progress?: number;
  nextClass?: string | null;
  enrolledCount?: number;
  materialCount?: number;
  department?: string;
  departmentId?: string;
}

export interface CourseTopic {
  id: string;
  title: string;
  position: number;
  completed: boolean;
}

export interface CourseMaterial {
  id: string;
  title: string;
  description: string;
  url: string;
  status: string;
  createdAt: string;
  uploaderName: string;
  fileUrl: string | null;
}

export interface CourseSchedule {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
}

export interface CourseAssignmentSummary {
  id: string;
  title: string;
  deadline: string;
  submissionCount: number;
  mySubmissionId: string | null;
  myStatus: string | null;
  myScore: number | null;
}

export interface CourseDetail {
  course: CourseSummary & { department: string; departmentId: string };
  topics: CourseTopic[];
  materials: CourseMaterial[];
  schedules: CourseSchedule[];
  assignments: CourseAssignmentSummary[];
  enrolledCount: number;
  myResult: { score: number; grade: string; points: number } | null;
  canManage: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'academic' | 'general' | 'urgent';
  status: string;
  department: string | null;
  publishedAt: string | null;
  createdAt: string;
  authorName: string;
  authorAvatar: string;
  mine: boolean;
}

export interface SubmissionInfo {
  id: string;
  status: 'submitted' | 'graded';
  isLate: boolean;
  score: number | null;
  remark: string;
  submittedAt: string;
  fileUrl: string | null;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  deadline: string;
  maxScore: number;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  department: string;
  level: string;
  createdByName: string;
  createdAt: string;
  isOverdue: boolean;
  submission?: SubmissionInfo;
  stats?: { enrolledCount: number; submissionCount: number; gradedCount: number };
  mine: boolean;
  attachmentUrl: string | null;
}

export interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  studentMatric: string;
  avatarUrl: string;
  fileUrl: string | null;
  note: string;
  isLate: boolean;
  status: string;
  score: number | null;
  remark: string;
  submittedAt: string;
  gradedByName: string | null;
}

export interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  authorIdentifier: string | null;
  authorAvatar: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface PostComment {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  avatarUrl: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  voteCount: number;
  votedByMe: boolean;
  mine: boolean;
}

export interface Community {
  id: string;
  name: string;
  icon: string;
  description: string;
  memberCount: number;
  joined: boolean;
}

export interface StudyRoom {
  id: string;
  title: string;
  topic: string;
  hostId: string;
  hostName: string;
  participantCount: number;
  joined: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'room';
  isGroup: boolean;
  title: string | null;
  partnerId: string | null;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface Message {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  mine: boolean;
  avatarUrl?: string;
}

export interface Person {
  userId: string;
  name: string;
  role: UserRole;
  identifier: string | null;
  department: string | null;
  avatarUrl: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
}

export interface ModerationItem {
  id: string;
  type: 'material' | 'announcement' | 'project' | 'hod_request';
  targetId: string | null;
  title: string;
  details: string;
  department: string | null;
  submittedByName: string;
  status: string;
  createdAt: string;
}

export interface RosterStudent {
  userId: string;
  name: string;
  matricNumber: string;
  avatarUrl: string;
  progress: number;
  result: { score: number; grade: string; points: number } | null;
}

export interface AdminStudent {
  userId: string;
  name: string;
  matricNumber: string;
  level: string;
  department: string;
  email: string;
  isActive: boolean;
  cgpa: number | null;
  resultsCount: number;
  enrolledCourses: number;
  avatarUrl: string;
}

export interface AdminStats {
  students: number;
  courses: number;
  enrolled: number;
  assignments: number;
  submissionsToGrade: number;
  pendingModeration: number;
  announcements: number;
  departmentId: string | null;
  scope: 'campus' | 'department';
}

export interface AttendanceSession {
  id: string;
  code: string;
  closesAt: string;
  courseCode: string;
  qrPayload: string;
  qrUrl: string;
}

export interface SearchResults {
  query: string;
  courses: { id: string; code: string; title: string; department: string; level: string }[];
  announcements: { id: string; title: string; content: string; type: string }[];
  posts: { id: string; content: string; authorName: string; avatarUrl: string }[];
  projects: { id: string; title: string; category: string; description: string }[];
  people: { id: string; name: string; role: string; identifier: string | null; department: string | null; avatarUrl: string }[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  id?: string;
  isError?: boolean;
  pending?: boolean;
}
