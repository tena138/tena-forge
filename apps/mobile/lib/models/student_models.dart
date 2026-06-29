import '../core/text_encoding.dart';

enum StudentContextType { personal, academy }

class StudentPersonalInfo {
  const StudentPersonalInfo({this.values = const {}});

  final Map<String, String> values;

  factory StudentPersonalInfo.fromJson(Map<String, dynamic>? json) {
    final source = json ?? const <String, dynamic>{};
    return StudentPersonalInfo(
      values: source.map(
        (key, value) => MapEntry(key.toString(), '${value ?? ''}'.trim()),
      )..removeWhere((_, value) => value.isEmpty),
    );
  }

  Map<String, String> toJson() => Map.unmodifiable(values);

  String value(String key) => values[key] ?? '';

  StudentPersonalInfo copyWithValue(String key, String value) {
    final next = Map<String, String>.from(values);
    final cleaned = value.trim();
    if (cleaned.isEmpty) {
      next.remove(key);
    } else {
      next[key] = cleaned;
    }
    return StudentPersonalInfo(values: next);
  }
}

class StudentProfile {
  const StudentProfile({
    required this.id,
    required this.email,
    this.displayName,
    this.profileName,
    this.accountType = 'academy',
    this.personalInfo = const StudentPersonalInfo(),
  });

  final String id;
  final String email;
  final String? displayName;
  final String? profileName;
  final String accountType;
  final StudentPersonalInfo personalInfo;

  factory StudentProfile.fromAuthProfile(
    Map<String, dynamic> json, {
    String? fallbackEmail,
    StudentPersonalInfo personalInfo = const StudentPersonalInfo(),
  }) {
    return StudentProfile(
      id: '${json['id'] ?? ''}',
      email: '${json['email'] ?? fallbackEmail ?? ''}',
      displayName:
          json['academy_name']?.toString() ??
          json['display_name']?.toString() ??
          json['name']?.toString(),
      profileName: json['profile_name']?.toString(),
      accountType: json['account_type']?.toString() ?? 'academy',
      personalInfo: personalInfo,
    );
  }

  StudentProfile copyWith({
    String? displayName,
    String? profileName,
    String? accountType,
    StudentPersonalInfo? personalInfo,
  }) {
    return StudentProfile(
      id: id,
      email: email,
      displayName: displayName ?? this.displayName,
      profileName: profileName ?? this.profileName,
      accountType: accountType ?? this.accountType,
      personalInfo: personalInfo ?? this.personalInfo,
    );
  }
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
    this.classId,
    this.className,
    this.classIds = const [],
    this.classNames = const [],
  });

  final String id;
  final String studentUserId;
  final String academyId;
  final String academySeatId;
  final String status;
  final DateTime joinedAt;
  final String? academyName;
  final String? classId;
  final String? className;
  final List<String> classIds;
  final List<String> classNames;

  factory AcademyMembership.fromJson(Map<String, dynamic> json) {
    final classIds = (json['class_ids'] as List? ?? const [])
        .map((item) => '$item')
        .toList(growable: false);
    final classNames = (json['class_names'] as List? ?? const [])
        .map((item) => '$item')
        .toList(growable: false);
    return AcademyMembership(
      id: '${json['id']}',
      studentUserId: '${json['student_user_id']}',
      academyId: '${json['academy_id']}',
      academySeatId: '${json['academy_seat_id']}',
      status: '${json['status'] ?? 'active'}',
      academyName: json['academy_name']?.toString(),
      classId:
          json['class_id']?.toString() ??
          (classIds.isNotEmpty ? classIds.first : null),
      className:
          json['class_name']?.toString() ??
          (classNames.isNotEmpty ? classNames.first : null),
      classIds: classIds,
      classNames: classNames,
      joinedAt: DateTime.tryParse('${json['joined_at']}') ?? DateTime.now(),
    );
  }
}

class StudentInvitePreview {
  const StudentInvitePreview({
    required this.inviteId,
    required this.academyId,
    required this.academyName,
    required this.status,
    required this.keyStatus,
    this.academyStudentId,
    this.studentName,
    this.classId,
    this.className,
    this.linkedUserId,
    this.claimedAt,
    this.expiresAt,
  });

  final String inviteId;
  final String academyId;
  final String academyName;
  final String status;
  final String keyStatus;
  final String? academyStudentId;
  final String? studentName;
  final String? classId;
  final String? className;
  final String? linkedUserId;
  final DateTime? claimedAt;
  final DateTime? expiresAt;

  bool get canClaim => status == 'pending' || keyStatus == 'unclaimed';

  factory StudentInvitePreview.fromJson(Map<String, dynamic> json) {
    return StudentInvitePreview(
      inviteId: '${json['invite_id']}',
      academyId: '${json['academy_id']}',
      academyName: json['academy_name']?.toString() ?? 'Academy',
      status: json['status']?.toString() ?? 'pending',
      keyStatus: json['key_status']?.toString() ?? 'unclaimed',
      academyStudentId: json['academy_student_id']?.toString(),
      studentName: json['student_name']?.toString(),
      classId: json['class_id']?.toString(),
      className: json['class_name']?.toString(),
      linkedUserId: json['linked_user_id']?.toString(),
      claimedAt: DateTime.tryParse('${json['claimed_at'] ?? ''}'),
      expiresAt: DateTime.tryParse('${json['expires_at'] ?? ''}'),
    );
  }
}

class StudentProfileRequirementField {
  const StudentProfileRequirementField({
    required this.key,
    required this.label,
    required this.enabled,
    required this.required,
    required this.realName,
  });

  final String key;
  final String label;
  final bool enabled;
  final bool required;
  final bool realName;

  factory StudentProfileRequirementField.fromJson(Map<String, dynamic> json) {
    return StudentProfileRequirementField(
      key: '${json['key'] ?? ''}',
      label: json['label']?.toString() ?? '${json['key'] ?? ''}',
      enabled: json['enabled'] != false,
      required: json['required'] == true,
      realName: json['real_name'] == true,
    );
  }
}

class AcademyKeyRequirements {
  const AcademyKeyRequirements({
    required this.academyId,
    required this.academyName,
    required this.fields,
    this.classId,
    this.className,
  });

  final String academyId;
  final String academyName;
  final String? classId;
  final String? className;
  final List<StudentProfileRequirementField> fields;

  Iterable<StudentProfileRequirementField> get enabledFields =>
      fields.where((field) => field.enabled);

  factory AcademyKeyRequirements.fromJson(Map<String, dynamic> json) {
    return AcademyKeyRequirements(
      academyId: '${json['academy_id'] ?? ''}',
      academyName: json['academy_name']?.toString() ?? 'Academy',
      classId: json['class_id']?.toString(),
      className: json['class_name']?.toString(),
      fields: (json['fields'] as List? ?? const [])
          .map(
            (item) => StudentProfileRequirementField.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(growable: false),
    );
  }
}

class StudentAcademyInvite {
  const StudentAcademyInvite({
    required this.id,
    required this.academyId,
    required this.academyName,
    required this.targetProfileName,
    required this.status,
    this.academySeatId,
    this.academyStudentId,
    this.studentName,
    this.classId,
    this.className,
    this.createdAt,
    this.acceptedAt,
    this.declinedAt,
  });

  final String id;
  final String academyId;
  final String academyName;
  final String targetProfileName;
  final String status;
  final String? academySeatId;
  final String? academyStudentId;
  final String? studentName;
  final String? classId;
  final String? className;
  final DateTime? createdAt;
  final DateTime? acceptedAt;
  final DateTime? declinedAt;

  factory StudentAcademyInvite.fromJson(Map<String, dynamic> json) {
    return StudentAcademyInvite(
      id: '${json['id']}',
      academyId: '${json['academy_id']}',
      academyName: json['academy_name']?.toString() ?? 'Academy',
      academySeatId: json['academy_seat_id']?.toString(),
      academyStudentId: json['academy_student_id']?.toString(),
      studentName: json['student_name']?.toString(),
      classId: json['class_id']?.toString(),
      className: json['class_name']?.toString(),
      targetProfileName: json['target_profile_name']?.toString() ?? '',
      status: json['status']?.toString() ?? 'pending',
      createdAt: DateTime.tryParse('${json['created_at'] ?? ''}'),
      acceptedAt: DateTime.tryParse('${json['accepted_at'] ?? ''}'),
      declinedAt: DateTime.tryParse('${json['declined_at'] ?? ''}'),
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
          .map(
            (item) =>
                QuotaContribution.fromJson(Map<String, dynamic>.from(item)),
          )
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
    this.academyName,
    this.sourceType,
    this.status,
    this.submittedAt,
    this.problemCount = 0,
    this.materialTitle,
    this.materialScope,
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
  final String? academyName;
  final String? sourceType;
  final String? status;
  final DateTime? submittedAt;
  final int problemCount;
  final String? materialTitle;
  final String? materialScope;

  bool get isTest => assignmentType == 'test';
  bool get isAwaitingTeacherConfirmation => status == 'pending_confirmation';
  bool get isCompleted =>
      submittedAt != null ||
      status == 'completed' ||
      status == 'submitted' ||
      status == 'late';
  String get statusLabel {
    if (isAwaitingTeacherConfirmation) return '선생 확인 대기';
    if (status == 'late') return '지각 완료';
    if (isCompleted) return '완료';
    if (status == 'in_progress') return '진행 중';
    return '대기';
  }

  String get badgeLabel {
    if (isCompleted) return '완료';
    if (isAwaitingTeacherConfirmation) return '확인 대기';
    return assignmentType;
  }

  factory Assignment.fromJson(Map<String, dynamic> json) {
    final content = json['content'] is Map
        ? Map<String, dynamic>.from(json['content'] as Map)
        : const <String, dynamic>{};
    final snapshot = content['snapshot'] is Map
        ? Map<String, dynamic>.from(content['snapshot'] as Map)
        : const <String, dynamic>{};
    final submission = json['submission'] is Map
        ? Map<String, dynamic>.from(json['submission'] as Map)
        : const <String, dynamic>{};
    final timeLimitSeconds = (json['time_limit_seconds'] as num?)?.toInt();
    final timeLimitMinutes =
        (json['time_limit_minutes'] as num?)?.toInt() ??
        (timeLimitSeconds == null ? null : (timeLimitSeconds / 60).ceil());
    final problemCount =
        (snapshot['problem_count'] as num?)?.toInt() ??
        (snapshot['problems'] as List?)?.length ??
        0;
    return Assignment(
      id: '${json['id']}',
      academyId: '${json['academy_id']}',
      title: '${json['title'] ?? 'Untitled'}',
      description: json['description']?.toString(),
      assignmentType:
          '${json['assignment_type'] ?? (timeLimitSeconds == null ? 'homework' : 'test')}',
      submissionMode:
          '${json['submission_mode'] ?? (problemCount > 0 ? 'problem_set' : 'completion')}',
      openAt: DateTime.tryParse('${json['open_at'] ?? json['start_at']}'),
      dueAt: DateTime.tryParse('${json['due_at']}'),
      closeAt: DateTime.tryParse('${json['close_at']}'),
      resultReleasePolicy: json['result_release_policy']?.toString(),
      timeLimitMinutes: timeLimitMinutes,
      academyName: json['academy_name']?.toString(),
      sourceType: json['source_type']?.toString(),
      status: submission['status']?.toString(),
      submittedAt: DateTime.tryParse('${submission['submitted_at']}'),
      problemCount: problemCount,
      materialTitle: snapshot['material_title']?.toString(),
      materialScope: snapshot['material_scope']?.toString(),
    );
  }
}

class StudentMaterialProblem {
  const StudentMaterialProblem({
    required this.id,
    required this.pageNumber,
    this.problemNumber,
    this.originalProblemNumber,
    this.problemText,
    this.visualUrl,
    this.reviewPageImageUrl,
    this.sourceLabel,
    this.tags = const [],
  });

  final String id;
  final int pageNumber;
  final String? problemNumber;
  final int? originalProblemNumber;
  final String? problemText;
  final String? visualUrl;
  final String? reviewPageImageUrl;
  final String? sourceLabel;
  final List<String> tags;

  factory StudentMaterialProblem.fromJson(
    Map<String, dynamic> json,
    int fallbackPageNumber,
  ) {
    final rawTags = json['tags'];
    return StudentMaterialProblem(
      id: '${json['problem_id'] ?? json['id'] ?? 'problem-$fallbackPageNumber'}',
      pageNumber:
          int.tryParse('${json['page_number'] ?? fallbackPageNumber}') ??
          fallbackPageNumber,
      problemNumber: json['problem_number'] == null
          ? null
          : repairKoreanText(json['problem_number'].toString()),
      originalProblemNumber: int.tryParse('${json['original_problem_number']}'),
      problemText: json['problem_text'] == null
          ? null
          : repairKoreanText(json['problem_text'].toString()),
      visualUrl: json['visual_url']?.toString(),
      reviewPageImageUrl: json['review_page_image_url']?.toString(),
      sourceLabel: json['source_label'] == null
          ? null
          : repairKoreanText(json['source_label'].toString()),
      tags: rawTags is List
          ? rawTags.map((value) => value.toString()).toList(growable: false)
          : rawTags is Map
          ? rawTags.values
                .map((value) => value?.toString().trim() ?? '')
                .where((value) => value.isNotEmpty)
                .toList(growable: false)
          : const [],
    );
  }
}

class StudentMaterialContent {
  const StudentMaterialContent({
    required this.title,
    required this.assignmentType,
    required this.problemScope,
    required this.renderMode,
    required this.allowExport,
    required this.problems,
    this.learningAssignmentId,
    this.sourceType,
    this.sourceId,
    this.timeLimitSeconds,
    this.dueAt,
    this.expiresAt,
  });

  final String title;
  final String? sourceType;
  final String? sourceId;
  final String assignmentType;
  final String problemScope;
  final String renderMode;
  final bool allowExport;
  final String? learningAssignmentId;
  final int? timeLimitSeconds;
  final DateTime? dueAt;
  final DateTime? expiresAt;
  final List<StudentMaterialProblem> problems;

  factory StudentMaterialContent.fromJson(Map<String, dynamic> json) {
    final rawProblems = json['problems'];
    final problems = rawProblems is List
        ? rawProblems
              .whereType<Map>()
              .toList(growable: false)
              .asMap()
              .entries
              .map(
                (entry) => StudentMaterialProblem.fromJson(
                  entry.value.cast<String, dynamic>(),
                  entry.key + 1,
                ),
              )
              .toList(growable: false)
        : const <StudentMaterialProblem>[];
    return StudentMaterialContent(
      title: repairKoreanText('${json['title'] ?? 'Untitled'}'),
      learningAssignmentId: json['learning_assignment_id']?.toString(),
      sourceType: json['source_type']?.toString(),
      sourceId: json['source_id']?.toString(),
      assignmentType: '${json['assignment_type'] ?? 'textbook'}',
      problemScope: '${json['problem_scope'] ?? 'all'}',
      renderMode: '${json['render_mode'] ?? 'notebook_problem_pages'}',
      allowExport: json['allow_export'] == true,
      timeLimitSeconds: int.tryParse('${json['time_limit_seconds']}'),
      dueAt: DateTime.tryParse('${json['due_at']}'),
      expiresAt: DateTime.tryParse('${json['expires_at']}'),
      problems: problems,
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
    this.academyName,
    this.content,
    this.expiresAt,
    this.updatedAt,
  });

  final String id;
  final String academyId;
  final String? academyName;
  final String title;
  final String materialType;
  final Map<String, bool> permissions;
  final StudentMaterialContent? content;
  final DateTime? expiresAt;
  final DateTime? updatedAt;

  bool get canDownload => permissions['download'] ?? false;
  bool get canAddToWrongAnswer => permissions['add_to_wrong_answer'] ?? false;

  factory StudentMaterial.fromJson(Map<String, dynamic> json) {
    final rawPermissions = json['permissions'] is Map
        ? json['permissions'] as Map
        : const {};
    return StudentMaterial(
      id: '${json['id']}',
      academyId: '${json['academy_id']}',
      academyName: json['academy_name'] == null
          ? null
          : repairKoreanText(json['academy_name'].toString()),
      title: repairKoreanText('${json['title'] ?? 'Untitled'}'),
      materialType: '${json['material_type'] ?? 'pdf'}',
      permissions: rawPermissions.map(
        (key, value) => MapEntry('$key', value == true),
      ),
      content: json['content'] is Map
          ? StudentMaterialContent.fromJson(
              (json['content'] as Map).cast<String, dynamic>(),
            )
          : null,
      expiresAt: DateTime.tryParse('${json['expires_at']}'),
      updatedAt: DateTime.tryParse(
        '${json['updated_at'] ?? json['created_at']}',
      ),
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
    this.className,
    this.sourceType,
    this.description,
  });

  final String id;
  final String title;
  final String? description;
  final String eventType;
  final DateTime startsAt;
  final DateTime? endsAt;
  final String visibility;
  final String? academyId;
  final String? className;
  final String? sourceType;

  factory CalendarItem.fromJson(Map<String, dynamic> json) {
    return CalendarItem(
      id: '${json['id']}',
      title: '${json['title'] ?? 'Untitled'}',
      description: json['description']?.toString(),
      eventType: '${json['event_type'] ?? 'custom'}',
      startsAt: DateTime.tryParse('${json['starts_at']}') ?? DateTime.now(),
      endsAt: DateTime.tryParse('${json['ends_at']}'),
      visibility: '${json['visibility'] ?? 'personal_private'}',
      academyId: json['academy_id']?.toString(),
      className: json['class_name']?.toString(),
      sourceType: json['source_type']?.toString(),
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
  const CalendarResponse({
    required this.events,
    required this.assignmentDueDates,
  });

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
          .map(
            (item) =>
                AssignmentDueDate.fromJson(Map<String, dynamic>.from(item)),
          )
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
