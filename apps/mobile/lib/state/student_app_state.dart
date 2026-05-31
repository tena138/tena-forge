import 'package:flutter/foundation.dart';

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

  String get selectedContextLabel {
    if (selectedContextId == 'personal') return 'Personal';
    final academy = selectedAcademy;
    if (academy == null) return 'Academy';
    final academyName = academy.academyName ?? 'Academy';
    return academy.className == null ? academyName : '$academyName · ${academy.className}';
  }

  Future<void> bootstrap() async {
    loading = true;
    notifyListeners();
    profile = await repository.restoreProfile();
    await refresh();
  }

  Future<void> login(String email, String password) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      profile = await repository.login(email, password);
      await refresh();
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
    notifyListeners();
  }

  Future<void> refresh() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait<Object>([
        repository.listAcademies(),
        repository.listAssignments(
          academyId: selectedAcademyId,
        ),
        repository.listWrongAnswers(),
        repository.listCalendar(),
      ]);
      academies = results[0] as List<AcademyMembership>;
      assignments = results[1] as List<Assignment>;
      wrongAnswers = results[2] as List<WrongAnswerItem>;
      calendar = results[3] as CalendarResponse;
      materials = const [];
      quota = null;
    } catch (exception) {
      error = '학생 앱 정보를 불러오지 못했습니다.';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> claimAcademyKey(String inviteCode) async {
    await repository.claimAcademyKey(inviteCode);
    selectedContextId = 'personal';
    await refresh();
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
    await repository.exportWrongAnswers(
      itemIds,
      academyId: selectedAcademyId,
    );
    await refresh();
  }
}
