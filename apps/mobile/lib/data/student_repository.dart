import '../core/academy_key.dart';
import '../core/api_client.dart';
import '../core/session_store.dart';
import '../models/student_models.dart';
import 'mock_data.dart';

class StudentRepository {
  StudentRepository({required this.apiClient, required this.sessionStore});

  final ApiClient apiClient;
  final SessionStore sessionStore;

  bool _canUseMock(Object exception) {
    return exception is! ApiException ||
        (exception.statusCode != 401 && exception.statusCode != 403);
  }

  Future<StudentProfile?> restoreProfile() async {
    final token = await sessionStore.readAccessToken();
    final profile = await sessionStore.readProfile();
    if (token != null && profile != null) {
      try {
        return await fetchMe();
      } catch (exception) {
        if (exception is! ApiException ||
            (exception.statusCode != 401 && exception.statusCode != 403)) {
          return profile;
        }
      }
    }

    final refreshed = await apiClient.refreshAccessToken();
    if (refreshed) {
      try {
        return await fetchMe();
      } catch (_) {
        await sessionStore.clear();
        return null;
      }
    }

    await sessionStore.clear();
    return null;
  }

  Future<StudentProfile> login(
    String identifier,
    String password, {
    bool remember = true,
  }) async {
    final json = await apiClient.post<Map<String, dynamic>>('/api/auth/login', {
      'email': identifier,
      'password': password,
      'remember': remember,
    }, (json) => Map<String, dynamic>.from(json as Map));
    if (json['requires_totp'] == true) {
      throw const ApiException('2단계 인증 계정은 현재 웹 로그인에서 계속 진행해 주세요.');
    }

    final token = json['access_token']?.toString();
    final academy = Map<String, dynamic>.from(
      json['academy'] as Map? ?? const {},
    );
    if (token == null || token.isEmpty || academy.isEmpty) {
      throw const ApiException('로그인 응답이 올바르지 않습니다.');
    }

    final previousProfile = await sessionStore.readProfile();
    await sessionStore.writeAccessToken(token);
    final profile = StudentProfile.fromAuthProfile(
      academy,
      fallbackEmail: identifier,
      personalInfo:
          previousProfile?.personalInfo ?? const StudentPersonalInfo(),
    );
    if (profile.id.isEmpty || profile.email.isEmpty) {
      throw const ApiException('프로필 응답이 올바르지 않습니다.');
    }
    await sessionStore.writeProfile(profile);
    return profile;
  }

  Future<StudentProfile> loginWithOAuthTokens({
    required String accessToken,
    String? refreshToken,
  }) async {
    await sessionStore.writeAccessToken(accessToken);
    if (refreshToken != null && refreshToken.isNotEmpty) {
      final cookie = refreshToken.startsWith('refresh_token=')
          ? refreshToken
          : 'refresh_token=$refreshToken';
      await sessionStore.writeRefreshCookie(cookie);
    }
    return fetchMe();
  }

  Future<StudentProfile> fetchMe() async {
    final previousProfile = await sessionStore.readProfile();
    final profile = await apiClient.get<StudentProfile>(
      '/api/auth/me',
      (json) => StudentProfile.fromAuthProfile(
        Map<String, dynamic>.from(json as Map),
        personalInfo:
            previousProfile?.personalInfo ?? const StudentPersonalInfo(),
      ),
    );
    if (profile.id.isEmpty || profile.email.isEmpty) {
      throw const ApiException('프로필 응답이 올바르지 않습니다.');
    }
    await sessionStore.writeProfile(profile);
    return profile;
  }

  Future<StudentProfile> savePersonalInfo(
    StudentPersonalInfo personalInfo,
  ) async {
    final current = await sessionStore.readProfile();
    if (current == null) {
      throw const ApiException('로그인이 필요합니다.');
    }
    final next = current.copyWith(personalInfo: personalInfo);
    await sessionStore.writeProfile(next);
    return next;
  }

  Future<void> logout() async {
    try {
      await apiClient.post<void>('/api/auth/logout', null, (_) {});
    } catch (_) {
      // Local logout should still succeed when the server session is already
      // expired, revoked, or unreachable.
    } finally {
      await sessionStore.clear();
    }
  }

  Future<List<AcademyMembership>> listAcademies({bool allowMock = true}) async {
    try {
      return apiClient.get<List<AcademyMembership>>(
        '/api/student/academies',
        (json) => (json as List)
            .map(
              (item) => AcademyMembership.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList(),
      );
    } catch (exception) {
      if (allowMock && _canUseMock(exception)) return mockAcademies;
      rethrow;
    }
  }

  Future<void> disconnectAcademy(String membershipId) {
    final encoded = Uri.encodeComponent(membershipId.trim());
    return apiClient.delete<void>('/api/student/academies/$encoded', (_) {});
  }

  Future<StudentInvitePreview> getStudentInvite(String token) {
    final encoded = Uri.encodeComponent(token.trim());
    return apiClient.get<StudentInvitePreview>(
      '/api/student/invites/$encoded',
      (json) =>
          StudentInvitePreview.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<AcademyMembership> claimStudentInvite(String token) {
    final encoded = Uri.encodeComponent(token.trim());
    return apiClient.post<AcademyMembership>(
      '/api/student/invites/$encoded/claim',
      {'student_profile': const <String, String>{}},
      (json) =>
          AcademyMembership.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<AcademyKeyRequirements> getAcademyKeyRequirements(String code) {
    final normalized = formatAcademyKey(code);
    final encoded = Uri.encodeQueryComponent(normalized);
    return apiClient.get<AcademyKeyRequirements>(
      '/api/student/academy-keys/requirements?invite_code=$encoded',
      (json) => AcademyKeyRequirements.fromJson(
        Map<String, dynamic>.from(json as Map),
      ),
    );
  }

  Future<AcademyMembership> claimAcademyKey(
    String code, {
    Map<String, String> studentProfile = const {},
  }) {
    final normalized = formatAcademyKey(code);
    return apiClient.post<AcademyMembership>(
      '/api/student/academy-keys/claim',
      {'invite_code': normalized, 'student_profile': studentProfile},
      (json) =>
          AcademyMembership.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<List<StudentAcademyInvite>> listAcademyInvites() {
    return apiClient.get<List<StudentAcademyInvite>>(
      '/api/student/academy-invites',
      (json) => (json as List)
          .map(
            (item) => StudentAcademyInvite.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
    );
  }

  Future<AcademyMembership> acceptAcademyInvite(String inviteId) {
    final encoded = Uri.encodeComponent(inviteId.trim());
    return apiClient.post<AcademyMembership>(
      '/api/student/academy-invites/$encoded/accept',
      null,
      (json) =>
          AcademyMembership.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<StudentAcademyInvite> declineAcademyInvite(String inviteId) {
    final encoded = Uri.encodeComponent(inviteId.trim());
    return apiClient.post<StudentAcademyInvite>(
      '/api/student/academy-invites/$encoded/decline',
      null,
      (json) =>
          StudentAcademyInvite.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<StudentQuota> getQuota({bool allowMock = true}) async {
    try {
      return apiClient.get<StudentQuota>(
        '/api/student/quotas',
        (json) => StudentQuota.fromJson(Map<String, dynamic>.from(json as Map)),
      );
    } catch (exception) {
      if (allowMock && _canUseMock(exception)) return mockQuota;
      rethrow;
    }
  }

  Future<List<Assignment>> listAssignments({
    String? academyId,
    bool allowMock = true,
  }) async {
    try {
      return apiClient.get<List<Assignment>>(
        '/api/learning/student/assignments${academyId == null ? '' : '?academy_id=$academyId'}',
        (json) => (json as List)
            .map(
              (item) =>
                  Assignment.fromJson(Map<String, dynamic>.from(item as Map)),
            )
            .toList(),
      );
    } catch (exception) {
      if (allowMock && _canUseMock(exception)) return mockAssignments;
      rethrow;
    }
  }

  Future<void> submitAssignment(String assignmentId, String answerText) {
    return apiClient.post<void>(
      '/api/learning/student/assignments/$assignmentId/complete',
      {'completion_note': answerText},
      (_) {},
    );
  }

  Future<Assignment> getAssignment(String assignmentId) {
    return apiClient.get<Assignment>(
      '/api/learning/student/assignments/$assignmentId',
      (json) => Assignment.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<void> startTest(String assignmentId) {
    return apiClient.post<void>(
      '/api/learning/student/assignments/$assignmentId/start',
      null,
      (_) {},
    );
  }

  Future<void> submitTestAnswers(
    String assignmentId, {
    required List<Map<String, dynamic>> answers,
    required int timeSpentSeconds,
  }) {
    return apiClient.post<void>(
      '/api/learning/student/assignments/$assignmentId/submit',
      {'answers': answers, 'time_spent_seconds': timeSpentSeconds},
      (_) {},
    );
  }

  Future<List<StudentMaterial>> listMaterials({bool allowMock = true}) async {
    try {
      return apiClient.get<List<StudentMaterial>>(
        '/api/student/materials',
        (json) => (json as List)
            .map(
              (item) => StudentMaterial.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList(),
      );
    } catch (exception) {
      if (allowMock && _canUseMock(exception)) return mockMaterials;
      rethrow;
    }
  }

  Future<void> requestMaterialDownload(String materialId) {
    return apiClient.post<void>(
      '/api/student/materials/$materialId/download',
      null,
      (_) {},
    );
  }

  Future<List<WrongAnswerItem>> listWrongAnswers({
    bool allowMock = true,
  }) async {
    try {
      return apiClient.get<List<WrongAnswerItem>>(
        '/api/student/wrong-answers',
        (json) => (json as List)
            .map(
              (item) => WrongAnswerItem.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList(),
      );
    } catch (exception) {
      if (allowMock && _canUseMock(exception)) return mockWrongAnswers;
      rethrow;
    }
  }

  Future<WrongAnswerItem> createWrongAnswer(Map<String, dynamic> payload) {
    return apiClient.post<WrongAnswerItem>(
      '/api/student/wrong-answers',
      payload,
      (json) =>
          WrongAnswerItem.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<String> uploadWrongAnswerImage({
    required String filePath,
    String? filename,
  }) async {
    final asset = await apiClient.uploadFile<Map<String, dynamic>>(
      '/api/assets',
      fieldName: 'file',
      filePath: filePath,
      filename: filename,
      decode: (json) => Map<String, dynamic>.from(json as Map),
    );
    return '${asset['id']}';
  }

  Future<void> exportWrongAnswers(List<String> itemIds, {String? academyId}) {
    return apiClient.post<void>('/api/student/wrong-answers/export', {
      'item_ids': itemIds,
      'academy_id': academyId,
    }, (_) {});
  }

  Future<String> extractNoteSelectionText(String imageBase64) async {
    final result = await apiClient.post<Map<String, dynamic>>(
      '/api/student/notes/extract-text',
      {'image_base64': imageBase64, 'image_mime': 'image/png'},
      (json) => Map<String, dynamic>.from(json as Map),
    );
    return (result['text'] ?? '').toString().trim();
  }

  Future<CalendarResponse> listCalendar({bool allowMock = true}) async {
    try {
      return apiClient.get<CalendarResponse>(
        '/api/student/calendar',
        (json) =>
            CalendarResponse.fromJson(Map<String, dynamic>.from(json as Map)),
      );
    } catch (exception) {
      if (allowMock && _canUseMock(exception)) return mockCalendar;
      rethrow;
    }
  }

  Future<ClassSchedulePreview> getClassSchedulePreview(String eventId) {
    final encoded = Uri.encodeComponent(eventId.trim());
    return apiClient.get<ClassSchedulePreview>(
      '/api/student/calendar/class-events/$encoded/preview',
      (json) =>
          ClassSchedulePreview.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }
}
