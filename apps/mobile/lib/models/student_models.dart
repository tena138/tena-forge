enum StudentContextType { personal, academy }

class StudentProfile {
  const StudentProfile({
    required this.id,
    required this.email,
    this.displayName,
  });

  final String id;
  final String email;
  final String? displayName;
}

class AcademyMembership {
  const AcademyMembership({
    required this.id,
    required this.studentUserId,
    required this.academyId,
    required this.academySeatId,
    required this.status,
    required this.joinedAt,
    this.academyName,
  });

  final String id;
  final String studentUserId;
  final String academyId;
  final String academySeatId;
  final String status;
  final DateTime joinedAt;
  final String? academyName;

  factory AcademyMembership.fromJson(Map<String, dynamic> json) {
    return AcademyMembership(
      id: '${json['id']}',
      studentUserId: '${json['student_user_id']}',
      academyId: '${json['academy_id']}',
      academySeatId: '${json['academy_seat_id']}',
      status: '${json['status'] ?? 'active'}',
      academyName: json['academy_name']?.toString(),
      joinedAt: DateTime.tryParse('${json['joined_at']}') ?? DateTime.now(),
    );
  }
}

class StudentQuota {
  const StudentQuota({
    required this.total,
    required this.used,
    required this.remaining,
    required this.contributions,
  });

  final Map<String, int> total;
  final Map<String, int> used;
  final Map<String, int> remaining;
  final List<QuotaContribution> contributions;

  factory StudentQuota.fromJson(Map<String, dynamic> json) {
    Map<String, int> readMap(Object? value) {
      final map = value is Map ? value : const {};
      return {
        'upload': (map['upload'] as num?)?.toInt() ?? 0,
        'extraction': (map['extraction'] as num?)?.toInt() ?? 0,
        'export': (map['export'] as num?)?.toInt() ?? 0,
      };
    }

    return StudentQuota(
      total: readMap(json['total']),
      used: readMap(json['used']),
      remaining: readMap(json['remaining']),
      contributions: (json['contributions'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => QuotaContribution.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }
}

class QuotaContribution {
  const QuotaContribution({
    required this.source,
    required this.upload,
    required this.extraction,
    required this.export,
    this.academyName,
  });

  final String source;
  final String? academyName;
  final int upload;
  final int extraction;
  final int export;

  factory QuotaContribution.fromJson(Map<String, dynamic> json) {
    return QuotaContribution(
      source: '${json['source']}',
      academyName: json['academy_name']?.toString(),
      upload: (json['upload'] as num?)?.toInt() ?? 0,
      extraction: (json['extraction'] as num?)?.toInt() ?? 0,
      export: (json['export'] as num?)?.toInt() ?? 0,
    );
  }
}

class Assignment {
  const Assignment({
    required this.id,
    required this.academyId,
    required this.title,
    required this.assignmentType,
    required this.submissionMode,
    this.description,
    this.openAt,
    this.dueAt,
    this.closeAt,
    this.resultReleasePolicy,
    this.timeLimitMinutes,
  });

  final String id;
  final String academyId;
  final String title;
  final String? description;
  final String assignmentType;
  final String submissionMode;
  final DateTime? openAt;
  final DateTime? dueAt;
  final DateTime? closeAt;
  final String? resultReleasePolicy;
  final int? timeLimitMinutes;

  bool get isTest => assignmentType == 'test';

  factory Assignment.fromJson(Map<String, dynamic> json) {
    return Assignment(
      id: '${json['id']}',
      academyId: '${json['academy_id']}',
      title: '${json['title'] ?? 'Untitled'}',
      description: json['description']?.toString(),
      assignmentType: '${json['assignment_type'] ?? 'homework'}',
      submissionMode: '${json['submission_mode'] ?? 'completion'}',
      openAt: DateTime.tryParse('${json['open_at']}'),
      dueAt: DateTime.tryParse('${json['due_at']}'),
      closeAt: DateTime.tryParse('${json['close_at']}'),
      resultReleasePolicy: json['result_release_policy']?.toString(),
      timeLimitMinutes: (json['time_limit_minutes'] as num?)?.toInt(),
    );
  }
}

class StudentMaterial {
  const StudentMaterial({
    required this.id,
    required this.academyId,
    required this.title,
    required this.materialType,
    required this.permissions,
    this.expiresAt,
  });

  final String id;
  final String academyId;
  final String title;
  final String materialType;
  final Map<String, bool> permissions;
  final DateTime? expiresAt;

  bool get canDownload => permissions['download'] ?? false;
  bool get canAddToWrongAnswer => permissions['add_to_wrong_answer'] ?? false;

  factory StudentMaterial.fromJson(Map<String, dynamic> json) {
    final rawPermissions = json['permissions'] is Map ? json['permissions'] as Map : const {};
    return StudentMaterial(
      id: '${json['id']}',
      academyId: '${json['academy_id']}',
      title: '${json['title'] ?? 'Untitled'}',
      materialType: '${json['material_type'] ?? 'pdf'}',
      permissions: rawPermissions.map((key, value) => MapEntry('$key', value == true)),
      expiresAt: DateTime.tryParse('${json['expires_at']}'),
    );
  }
}

class CalendarItem {
  const CalendarItem({
    required this.id,
    required this.title,
    required this.eventType,
    required this.startsAt,
    required this.endsAt,
    required this.visibility,
    this.academyId,
    this.description,
  });

  final String id;
  final String title;
  final String? description;
  final String eventType;
  final DateTime startsAt;
  final DateTime endsAt;
  final String visibility;
  final String? academyId;

  factory CalendarItem.fromJson(Map<String, dynamic> json) {
    return CalendarItem(
      id: '${json['id']}',
      title: '${json['title'] ?? 'Untitled'}',
      description: json['description']?.toString(),
      eventType: '${json['event_type'] ?? 'custom'}',
      startsAt: DateTime.tryParse('${json['starts_at']}') ?? DateTime.now(),
      endsAt: DateTime.tryParse('${json['ends_at']}') ?? DateTime.now(),
      visibility: '${json['visibility'] ?? 'personal_private'}',
      academyId: json['academy_id']?.toString(),
    );
  }
}

class WrongAnswerItem {
  const WrongAnswerItem({
    required this.id,
    required this.studentUserId,
    required this.sourceType,
    required this.visibility,
    required this.tags,
    required this.createdAt,
    this.academyId,
    this.originalImageAssetId,
    this.problemText,
    this.answer,
    this.explanation,
    this.subject,
    this.unit,
    this.difficulty,
    this.memo,
  });

  final String id;
  final String studentUserId;
  final String? academyId;
  final String? originalImageAssetId;
  final String sourceType;
  final String? problemText;
  final String? answer;
  final String? explanation;
  final String? subject;
  final String? unit;
  final String? difficulty;
  final List<String> tags;
  final String visibility;
  final String? memo;
  final DateTime createdAt;

  factory WrongAnswerItem.fromJson(Map<String, dynamic> json) {
    return WrongAnswerItem(
      id: '${json['id']}',
      studentUserId: '${json['student_user_id']}',
      academyId: json['academy_id']?.toString(),
      originalImageAssetId: json['original_image_asset_id']?.toString(),
      sourceType: '${json['source_type'] ?? 'manual_entry'}',
      problemText: json['extracted_problem_text']?.toString(),
      answer: json['extracted_answer']?.toString(),
      explanation: json['extracted_explanation']?.toString(),
      subject: json['subject']?.toString(),
      unit: json['unit']?.toString(),
      difficulty: json['difficulty']?.toString(),
      tags: (json['tags'] as List? ?? const []).map((item) => '$item').toList(),
      visibility: '${json['visibility'] ?? 'private'}',
      memo: json['memo']?.toString(),
      createdAt: DateTime.tryParse('${json['created_at']}') ?? DateTime.now(),
    );
  }
}

class CalendarResponse {
  const CalendarResponse({required this.events, required this.assignmentDueDates});

  final List<CalendarItem> events;
  final List<AssignmentDueDate> assignmentDueDates;

  factory CalendarResponse.fromJson(Map<String, dynamic> json) {
    return CalendarResponse(
      events: (json['events'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => CalendarItem.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      assignmentDueDates: (json['assignment_due_dates'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => AssignmentDueDate.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }
}

class AssignmentDueDate {
  const AssignmentDueDate({required this.id, required this.title, this.dueAt});

  final String id;
  final String title;
  final DateTime? dueAt;

  factory AssignmentDueDate.fromJson(Map<String, dynamic> json) {
    return AssignmentDueDate(
      id: '${json['id']}',
      title: '${json['title'] ?? 'Untitled'}',
      dueAt: DateTime.tryParse('${json['due_at']}'),
    );
  }
}
