import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../data/student_repository.dart';
import '../models/student_models.dart';

class StudentAppState extends ChangeNotifier {
  StudentAppState(this.repository);

  final StudentRepository repository;

  StudentProfile? profile;
  List<AcademyMembership> academies = [];
  List<Assignment> assignments = [];
  List<StudentMaterial> materials = [];
  List<WrongAnswerItem> wrongAnswers = [];
  CalendarResponse? calendar;
  StudentQuota? quota;
  String selectedContextId = 'personal';
  bool loading = true;
  bool bootstrapped = false;
  String? error;

  bool get isAuthenticated => profile != null;

  AcademyMembership? get selectedAcademy {
    if (selectedContextId == 'personal') return null;
    for (final academy in academies) {
      if (academy.id == selectedContextId) return academy;
    }
    return academies.isNotEmpty ? academies.first : null;
  }

  String? get selectedAcademyId =>
      selectedContextId == 'personal' ? null : selectedAcademy?.academyId;

  StudentPersonalInfo get personalInfo =>
      profile?.personalInfo ?? const StudentPersonalInfo();

  String get selectedContextLabel {
    if (selectedContextId == 'personal') return 'Personal';
    final academy = selectedAcademy;
    if (academy == null) return 'Academy';
    final academyName = academy.academyName ?? 'Academy';
    return academy.className == null
        ? academyName
        : '$academyName · ${academy.className}';
  }

  Future<void> bootstrap() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      profile = await repository.restoreProfile();
      if (profile != null) {
        await refresh();
      }
    } catch (_) {
      try {
        await repository.logout();
      } catch (_) {
        // The stored token may already be expired or revoked during startup.
      }
      profile = null;
      academies = [];
      assignments = [];
      materials = [];
      wrongAnswers = [];
      calendar = null;
      selectedContextId = 'personal';
    } finally {
      bootstrapped = true;
      loading = false;
      notifyListeners();
    }
  }

  Future<void> login(
    String identifier,
    String password, {
    bool remember = true,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      profile = await repository.login(
        identifier,
        password,
        remember: remember,
      );
      await refresh();
      bootstrapped = true;
    } catch (exception) {
      error = '로그인에 실패했습니다.';
      loading = false;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    await repository.logout();
    profile = null;
    selectedContextId = 'personal';
    bootstrapped = true;
    notifyListeners();
  }

  Future<void> refresh() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait<Object>([
        repository.listAcademies(allowMock: false),
        repository.listAssignments(
          academyId: selectedAcademyId,
          allowMock: false,
        ),
        repository.listCalendar(allowMock: false),
        repository.listMaterials(allowMock: false),
      ]);
      academies = results[0] as List<AcademyMembership>;
      assignments = results[1] as List<Assignment>;
      calendar = results[2] as CalendarResponse;
      materials = results[3] as List<StudentMaterial>;
      quota = null;
      notifyListeners();

      try {
        wrongAnswers = await repository
            .listWrongAnswers(allowMock: false)
            .timeout(const Duration(seconds: 6));
      } catch (exception) {
        if (exception is ApiException &&
            (exception.statusCode == 401 || exception.statusCode == 403)) {
          rethrow;
        }
      }
    } catch (exception) {
      if (exception is ApiException &&
          (exception.statusCode == 401 || exception.statusCode == 403)) {
        await repository.logout();
        profile = null;
        selectedContextId = 'personal';
        error = '세션이 만료되었습니다. 다시 로그인해 주세요.';
      } else {
        error = '학생 앱 정보를 불러오지 못했습니다.';
      }
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<StudentInvitePreview> loadStudentInvite(String token) {
    return repository.getStudentInvite(token);
  }

  Future<AcademyMembership> claimStudentInvite(String token) async {
    final membership = await repository.claimStudentInvite(token);
    await handleStudentInviteClaimSuccess(
      userId: profile?.id,
      academyStudentId: membership.id,
      academyId: membership.academyId,
    );
    return membership;
  }

  Future<void> handleStudentInviteClaimSuccess({
    required String? userId,
    required String? academyStudentId,
    required String? academyId,
  }) async {
    selectedContextId = 'personal';
    await refresh();
  }

  Future<void> savePersonalInfo(StudentPersonalInfo personalInfo) async {
    profile = await repository.savePersonalInfo(personalInfo);
    notifyListeners();
  }

  void selectContext(String contextId) {
    selectedContextId = contextId;
    notifyListeners();
    refresh();
  }

  Future<void> submitAssignment(String assignmentId, String answerText) async {
    await repository.submitAssignment(assignmentId, answerText);
    await refresh();
  }

  Future<void> startTest(String assignmentId) async {
    await repository.startTest(assignmentId);
    await refresh();
  }

  Future<void> addWrongAnswer({
    required String sourceType,
    required String problemText,
    String? memo,
    String? imagePath,
    String? imageName,
  }) async {
    final imageAssetId = imagePath == null
        ? null
        : await repository.uploadWrongAnswerImage(
            filePath: imagePath,
            filename: imageName,
          );
    final payload = <String, dynamic>{
      'source_type': sourceType,
      'extracted_problem_text': problemText,
      'visibility': 'private',
      'memo': memo,
      'tags': [sourceType],
    };
    if (imageAssetId != null) {
      payload['source_ref_id'] = imageAssetId;
      payload['original_image_asset_id'] = imageAssetId;
    }
    await repository.createWrongAnswer(payload);
    await refresh();
  }

  Future<void> exportWrongAnswerSheet(List<String> itemIds) async {
    await repository.exportWrongAnswers(itemIds, academyId: selectedAcademyId);
    await refresh();
  }

  Future<String> extractNoteSelectionText(String imageBase64) {
    return repository.extractNoteSelectionText(imageBase64);
  }
}
