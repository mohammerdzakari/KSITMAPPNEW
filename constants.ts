




import { Course, HubProject, Post, CommunityChannel, Announcement, StudentProfile, AdminProfile, PendingContent, ChatSession, DirectMessage, StudyRoom, Assignment, AssignmentSubmission } from './types';

// Updated to the official KSITM Logo
export const LOGO_URL = 'https://i.postimg.cc/HnsGKBX5/KSITM-LOGO.jpg';

// Secret code for Admin/Lecturer verification
export const ADMIN_VERIFICATION_CODE = 'STF-KSITM-2025';

export const MOCK_PROFILE: StudentProfile = {
  firstName: 'Usman',
  lastName: 'Abdullahi',
  matricNumber: 'KSITM/CS/23/045',
  department: 'Computer Science',
  level: 'ND II',
  gpa: 3.45,
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Usman',
  email: 'u.abdullahi@student.ksitm.edu.ng',
  phone: '+234 803 123 4567',
  role: 'student',
  streak: 12,
  timetable: 'Mon 10:00 AM',
  notifications: 2,
  results: 'Pending',
  dateOfBirth: '2000-01-01',
  username: 'usman_codes'
};

export const MOCK_ADMIN_PROFILE: AdminProfile = {
  firstName: 'Aminu',
  lastName: 'Kano',
  email: 'a.kano@ksitm.edu.ng',
  department: 'Computer Science',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aminu&clothing=blazerAndShirt',
  role: 'admin',
  staffId: 'KSITM/STAFF/001',
  isHOD: false
};

// Mock Database of Students for HOD View
export const MOCK_ALL_STUDENTS: StudentProfile[] = [
  MOCK_PROFILE,
  {
    firstName: 'Zainab',
    lastName: 'Yusuf',
    matricNumber: 'KSITM/CS/23/050',
    department: 'Computer Science',
    level: 'ND I',
    gpa: 3.8,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zainab',
    email: 'z.yusuf@student.ksitm.edu.ng',
    phone: '',
    role: 'student',
    streak: 5,
    timetable: '',
    notifications: 0
  },
  {
    firstName: 'Musa',
    lastName: 'Ibrahim',
    matricNumber: 'KSITM/EE/23/012',
    department: 'Electrical / Electronics Engineering Technology',
    level: 'ND II',
    gpa: 3.2,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Musa',
    email: 'm.ibrahim@student.ksitm.edu.ng',
    phone: '',
    role: 'student',
    streak: 2,
    timetable: '',
    notifications: 0
  },
  {
    firstName: 'Aisha',
    lastName: 'Bello',
    matricNumber: 'KSITM/ACC/23/088',
    department: 'Accountancy',
    level: 'ND I',
    gpa: 3.9,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aisha',
    email: 'a.bello@student.ksitm.edu.ng',
    phone: '',
    role: 'student',
    streak: 20,
    timetable: '',
    notifications: 0
  }
];

export const KSITM_COURSES_DATA: Record<string, string[]> = {
  "National Diploma (ND)": [
    "Accountancy",
    "Library and Information Science",
    "Electrical / Electronics Engineering Technology",
    "Computer Science",
    "Computer Engineering Technology"
  ],
  "National Innovation Diploma (NID)": [
    "Computer Software Engineering",
    "Networking and System Security",
    "Multimedia Technology",
    "Computer Hardware Engineering Technology",
    "Security Management and Technology",
    "Business Informatics",
    "Banking Operations",
    "Islamic Banking and Finance"
  ],
  "Short Courses / Certifications": [
    "CCNA / Networking Fundamentals",
    "Web Development",
    "Web Design",
    "Data Processing",
    "ICT Trainings"
  ]
};

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: '1',
    title: 'Semester Exam Timetable',
    date: 'Oct 24, 2024',
    content: 'The draft timetable for the 2024/2025 First Semester exams has been released. Check the notice board.',
    type: 'academic'
  },
  {
    id: '2',
    title: 'Rectors Cup Registration',
    date: 'Oct 22, 2024',
    content: 'Registration for the annual football tournament is now open for all departments.',
    type: 'general'
  }
];

export const MOCK_COURSES: Course[] = [
  {
    id: '1',
    code: 'COM 311',
    title: 'Operating Systems II',
    progress: 75,
    topics: ['Process Scheduling', 'Memory Management', 'Deadlocks', 'File Systems'],
    nextClass: 'Mon 10:00 AM'
  },
  {
    id: '2',
    code: 'COM 312',
    title: 'Database Design I',
    progress: 40,
    topics: ['Normalization', 'SQL Basics', 'ER Diagrams', 'Indexing'],
    nextClass: 'Tue 2:00 PM'
  },
  {
    id: '3',
    code: 'GNS 301',
    title: 'Use of English III',
    progress: 90,
    topics: ['Report Writing', 'Communication Skills', 'Speech Writing'],
    nextClass: 'Wed 8:00 AM'
  },
  {
    id: '4',
    code: 'EED 413',
    title: 'Entrepreneurship Dev',
    progress: 20,
    topics: ['Business Planning', 'Market Research', 'Capital Acquisition'],
    nextClass: 'Thu 12:00 PM'
  }
];

export const MOCK_POSTS: Post[] = [
  {
    id: '1',
    author: 'Ahmed Musa',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed',
    time: '2 hrs ago',
    content: 'Just finished the final project for Robotics class! KSITM is taking over. 🚀 #Robotics #KSITM',
    likes: 45,
    comments: 12,
    image: 'https://picsum.photos/seed/robot/500/300'
  },
  {
    id: '2',
    author: 'Fatima Bello',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fatima',
    time: '4 hrs ago',
    content: 'Does anyone have the past questions for COM 311? The exam is approaching fast!',
    likes: 12,
    comments: 5
  },
  {
    id: '3',
    author: 'KSITM Official',
    avatar: 'https://ui-avatars.com/api/?name=KSITM&background=0D8ABC&color=fff',
    time: '1 day ago',
    content: 'Innovation Week starts next Monday! Submit your projects to the Hub before Friday.',
    likes: 156,
    comments: 43
  }
];

export const MOCK_PROJECTS: HubProject[] = [
  {
    id: '1',
    title: 'Solar Powered Attendance',
    student: 'Team Alpha',
    category: 'IoT',
    description: 'An automated attendance system using RFID and Solar power for rural schools in Katsina.',
    votes: 120
  },
  {
    id: '2',
    title: 'AgroTech Katsina',
    student: 'Ibrahim Y.',
    category: 'Agriculture',
    description: 'Mobile app for local farmers to detect crop diseases using AI vision.',
    votes: 89
  },
  {
    id: '3',
    title: 'EduShare',
    student: 'Grace O.',
    category: 'Software',
    description: 'P2P textbook sharing platform for students.',
    votes: 67
  }
];

export const MOCK_COMMUNITIES: CommunityChannel[] = [
  { id: '1', name: 'Software Devs', members: 240, icon: '💻', description: 'Coding, Web, Mobile & more' },
  { id: '2', name: 'Cyber Security', members: 150, icon: '🔒', description: 'Ethical Hacking & Network Security' },
  { id: '3', name: 'Robotics & IoT', members: 95, icon: '🤖', description: 'Hardware hacking and automation' },
  { id: '4', name: 'AgriTech', members: 45, icon: '🌾', description: 'Technology in Agriculture' },
  { id: '5', name: 'Business & EED', members: 112, icon: '💼', description: 'Startups and Entrepreneurship' },
];

export const MOCK_PENDING_CONTENT: PendingContent[] = [
  {
    id: '1',
    title: 'Intro to Python PDF',
    author: 'Mal. Ibrahim (Lecturer)',
    type: 'Course Material',
    date: 'Oct 25, 2024',
    status: 'pending',
    details: 'Lecture notes for Week 4 of COM 112. Contains 15 pages of slides.'
  },
  {
    id: '2',
    title: 'Holiday Break Notice',
    author: 'Admin Office',
    type: 'Announcement',
    date: 'Oct 26, 2024',
    status: 'pending',
    details: 'Draft announcement regarding the upcoming semester break start dates.'
  },
  {
    id: '3',
    title: 'Robotics Club Funding',
    author: 'Student Union',
    type: 'Project',
    date: 'Oct 26, 2024',
    status: 'pending',
    details: 'Request for approval of budget for the new robotics kit acquisition.'
  }
];

export const MOCK_CHATS: ChatSession[] = [
  { id: '1', partnerName: 'Fatima Bello', partnerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fatima', lastMessage: 'Did you submit the assignment?', time: '2m', unread: 1 },
  { id: '2', partnerName: 'Robotics Team', partnerAvatar: 'https://ui-avatars.com/api/?name=RT&background=random', lastMessage: 'Meeting at 4pm in the Hub.', time: '1h', unread: 3, isGroup: true },
  { id: '3', partnerName: 'Ahmed Musa', partnerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed', lastMessage: 'Thanks for the notes!', time: '1d', unread: 0 },
];

export const MOCK_MESSAGES: Record<string, DirectMessage[]> = {
  '1': [
    { id: '1', senderId: 'partner', text: 'Hey, are you done with the Java project?', timestamp: Date.now() - 1000000 },
    { id: '2', senderId: 'me', text: 'Almost, just debugging the login module.', timestamp: Date.now() - 500000 },
    { id: '3', senderId: 'partner', text: 'Did you submit the assignment?', timestamp: Date.now() - 120000 },
  ],
  '2': [
    { id: '1', senderId: 'partner', text: 'Guys, we need to meet today.', timestamp: Date.now() - 3600000 },
  ],
  '3': [
    { id: '1', senderId: 'me', text: 'Here are the notes from today.', timestamp: Date.now() - 86400000 },
    { id: '2', senderId: 'partner', text: 'Thanks for the notes!', timestamp: Date.now() - 86000000 },
  ]
};

export const MOCK_STUDY_ROOMS: StudyRoom[] = [
  { id: '1', title: 'Calculus Revision', host: 'Usman A.', participants: 4, topic: 'Math', isActive: true },
  { id: '2', title: 'Java Group Study', host: 'Tech Geeks', participants: 6, topic: 'Programming', isActive: true },
  { id: '3', title: 'GNS Exam Prep', host: 'Sarah J.', participants: 12, topic: 'General', isActive: true },
];

// Mock Assignments
export const MOCK_ASSIGNMENTS: Assignment[] = [
  {
    id: 'a1',
    courseId: 'COM 311',
    department: 'Computer Science',
    level: 'ND II',
    title: 'Process Scheduling Algorithm Analysis',
    description: 'Write a detailed report comparing Round Robin and FCFS scheduling algorithms. Include diagrams.',
    deadline: Date.now() + 86400000 * 2, // 2 days from now
    createdBy: 'Dr. Aminu Kano',
    createdAt: Date.now() - 86400000
  },
  {
    id: 'a2',
    courseId: 'COM 312',
    department: 'Computer Science',
    level: 'ND II',
    title: 'ER Diagram for Hospital System',
    description: 'Design an ER diagram for a general hospital management system. Submit as PDF.',
    deadline: Date.now() - 86400000, // Yesterday (Late if not submitted)
    createdBy: 'Mal. Ibrahim',
    createdAt: Date.now() - 86400000 * 5
  },
  {
    id: 'a3',
    courseId: 'GNS 301',
    department: 'General Studies',
    level: 'ND II',
    title: 'Essay on Technology in Katsina',
    description: 'Write a 1000 word essay on the impact of technology in Katsina State.',
    deadline: Date.now() + 86400000 * 7, // 7 days from now
    createdBy: 'Mrs. Fatima',
    createdAt: Date.now()
  }
];

// Mock Submissions
export const MOCK_SUBMISSIONS: AssignmentSubmission[] = [
  {
    id: 's1',
    assignmentId: 'a2',
    studentId: 'KSITM/CS/23/045', // Matches Mock Profile matricNumber (simulating ID)
    studentName: 'Usman Abdullahi',
    studentMatric: 'KSITM/CS/23/045',
    fileUrl: 'hospital_db.pdf',
    submittedAt: Date.now() - 90000000, // Submitted before deadline
    isLate: false,
    score: 85,
    remark: 'Good work on the relationships.',
    gradedBy: 'Mal. Ibrahim',
    gradedAt: Date.now(),
    status: 'graded'
  },
];