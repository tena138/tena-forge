import '../models/student_models.dart';

final mockAcademies = [
  AcademyMembership(
    id: 'mship_demo_1',
    studentUserId: 'student_demo',
    academyId: 'academy_demo',
    academySeatId: 'seat_demo_1',
    status: 'active',
    academyName: 'Tena 수학관',
    joinedAt: DateTime.now(),
  ),
];

const mockQuota = StudentQuota(
  total: {'upload': 15, 'extraction': 15, 'export': 15},
  used: {'upload': 2, 'extraction': 1, 'export': 0},
  remaining: {'upload': 13, 'extraction': 14, 'export': 15},
  contributions: [
    QuotaContribution(source: 'personal', upload: 5, extraction: 5, export: 5),
    QuotaContribution(source: 'academy_demo', academyName: 'Tena 수학관', upload: 10, extraction: 10, export: 10),
  ],
);

final mockAssignments = [
  Assignment(
    id: 'asgn_demo_1',
    academyId: 'academy_demo',
    title: '이차함수 오답 복습',
    description: '지난 테스트에서 틀린 유형을 다시 풀고 풀이 사진을 제출하세요.',
    assignmentType: 'homework',
    submissionMode: 'solution_photo',
    dueAt: DateTime.now().add(const Duration(days: 1)),
  ),
  Assignment(
    id: 'test_demo_1',
    academyId: 'academy_demo',
    title: '수1 특강 주간 테스트',
    description: '시작 후 40분 동안 응시할 수 있습니다.',
    assignmentType: 'test',
    submissionMode: 'timed_test',
    openAt: DateTime.now().subtract(const Duration(hours: 1)),
    closeAt: DateTime.now().add(const Duration(days: 2)),
    timeLimitMinutes: 40,
  ),
];

final mockMaterials = [
  StudentMaterial(
    id: 'mat_demo_1',
    academyId: 'academy_demo',
    title: '고1 수학 내신 대비 프린트',
    materialType: 'pdf',
    permissions: const {
      'view': true,
      'download': false,
      'print': false,
      'export': false,
      'add_to_wrong_answer': true,
    },
  ),
];

final mockWrongAnswers = [
  WrongAnswerItem(
    id: 'wrong_demo_1',
    studentUserId: 'student_demo',
    sourceType: 'manual_entry',
    problemText: '이차함수의 꼭짓점과 최댓값을 구하는 문제',
    subject: '수학',
    unit: '이차함수',
    difficulty: '중',
    tags: const ['고1', '내신'],
    visibility: 'private',
    createdAt: DateTime.now(),
  ),
];

final mockCalendar = CalendarResponse(
  events: [
    CalendarItem(
      id: 'event_demo_1',
      title: '개인 오답 복습',
      eventType: 'personal',
      startsAt: DateTime.now().add(const Duration(hours: 2)),
      endsAt: DateTime.now().add(const Duration(hours: 3)),
      visibility: 'personal_private',
    ),
  ],
  assignmentDueDates: [
    AssignmentDueDate(id: mockAssignments.first.id, title: mockAssignments.first.title, dueAt: mockAssignments.first.dueAt),
  ],
);

