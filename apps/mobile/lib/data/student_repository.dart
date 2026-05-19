import '../core/api_client.dart';
import '../core/session_store.dart';
import '../models/student_models.dart';
import 'mock_data.dart';

class StudentRepository {
  StudentRepository({required this.apiClient, required this.sessionStore});

  final ApiClient apiClient;
  final SessionStore sessionStore;

  Future<StudentProfile?> restoreProfile() => sessionStore.readProfile();

  Future<StudentProfile> login(String email, String password) async {
    final json = await apiClient.post<Map<String, dynamic>>(
      '/api/auth/login',
      {'email': email, 'password': password, 'remember': true},
      (json) => Map<String, dynamic>.from(json as Map),
    );
    final token = json['access_token']?.toString();
    final academy = Map<String, dynamic>.from(json['academy'] as Map? ?? const {});
    if (token != null) await sessionStore.writeAccessToken(token);
    final profile = StudentProfile(
      id: '${academy['id']}',
      email: '${academy['email'] ?? email}',
      displayName: academy['academy_name']?.toString(),
    );
    await sessionStore.writeProfile(profile);
    return profile;
  }

  Future<void> logout() => sessionStore.clear();

  Future<List<AcademyMembership>> listAcademies({bool allowMock = true}) async {
    try {
      return apiClient.get<List<AcademyMembership>>(
        '/api/student/academies',
        (json) => (json as List).map((item) => AcademyMembership.fromJson(Map<String, dynamic>.from(item as Map))).toList(),
      );
    } catch (_) {
      if (allowMock) return mockAcademies;
      rethrow;
    }
  }

  Future<AcademyMembership> claimAcademyKey(String inviteCode) {
    return apiClient.post<AcademyMembership>(
      '/api/student/academy-keys/claim',
      {'invite_code': inviteCode},
      (json) => AcademyMembership.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<StudentQuota> getQuota({bool allowMock = true}) async {
    try {
      return apiClient.get<StudentQuota>(
        '/api/student/quotas',
        (json) => StudentQuota.fromJson(Map<String, dynamic>.from(json as Map)),
      );
    } catch (_) {
      if (allowMock) return mockQuota;
      rethrow;
    }
  }

  Future<List<Assignment>> listAssignments({String? academyId, bool allowMock = true}) async {
    try {
      return apiClient.get<List<Assignment>>(
        '/api/student/assignments${academyId == null ? '' : '?academy_id=$academyId'}',
        (json) => (json as List).map((item) => Assignment.fromJson(Map<String, dynamic>.from(item as Map))).toList(),
      );
    } catch (_) {
      if (allowMock) return mockAssignments;
      rethrow;
    }
  }

  Future<void> submitAssignment(String assignmentId, String answerText) {
    return apiClient.post<void>(
      '/api/student/assignments/$assignmentId/submit',
      {
        'answers': [
          {'item_index': 0, 'answer_text': answerText},
        ],
      },
      (_) {},
    );
  }

  Future<void> startTest(String assignmentId) {
    return apiClient.post<void>('/api/student/tests/$assignmentId/start', null, (_) {});
  }

  Future<List<StudentMaterial>> listMaterials({bool allowMock = true}) async {
    try {
      return apiClient.get<List<StudentMaterial>>(
        '/api/student/materials',
        (json) => (json as List).map((item) => StudentMaterial.fromJson(Map<String, dynamic>.from(item as Map))).toList(),
      );
    } catch (_) {
      if (allowMock) return mockMaterials;
      rethrow;
    }
  }

  Future<void> requestMaterialDownload(String materialId) {
    return apiClient.post<void>('/api/student/materials/$materialId/download', null, (_) {});
  }

  Future<List<WrongAnswerItem>> listWrongAnswers({bool allowMock = true}) async {
    try {
      return apiClient.get<List<WrongAnswerItem>>(
        '/api/student/wrong-answers',
        (json) => (json as List).map((item) => WrongAnswerItem.fromJson(Map<String, dynamic>.from(item as Map))).toList(),
      );
    } catch (_) {
      if (allowMock) return mockWrongAnswers;
      rethrow;
    }
  }

  Future<WrongAnswerItem> createWrongAnswer(Map<String, dynamic> payload) {
    return apiClient.post<WrongAnswerItem>(
      '/api/student/wrong-answers',
      payload,
      (json) => WrongAnswerItem.fromJson(Map<String, dynamic>.from(json as Map)),
    );
  }

  Future<void> exportWrongAnswers(List<String> itemIds, {String? academyId}) {
    return apiClient.post<void>(
      '/api/student/wrong-answers/export',
      {'item_ids': itemIds, 'academy_id': academyId},
      (_) {},
    );
  }

  Future<CalendarResponse> listCalendar({bool allowMock = true}) async {
    try {
      return apiClient.get<CalendarResponse>(
        '/api/student/calendar',
        (json) => CalendarResponse.fromJson(Map<String, dynamic>.from(json as Map)),
      );
    } catch (_) {
      if (allowMock) return mockCalendar;
      rethrow;
    }
  }
}

