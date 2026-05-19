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

  String get selectedContextLabel {
    if (selectedContextId == 'personal') return 'Personal';
    return academies.firstWhere(
      (academy) => academy.academyId == selectedContextId,
      orElse: () => academies.isNotEmpty ? academies.first : AcademyMembership(
        id: 'none',
        studentUserId: 'none',
        academyId: selectedContextId,
        academySeatId: 'none',
        status: 'active',
        joinedAt: DateTime.now(),
      ),
    ).academyName ?? 'Academy';
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
        repository.getQuota(),
        repository.listAssignments(academyId: selectedContextId == 'personal' ? null : selectedContextId),
        repository.listMaterials(),
        repository.listWrongAnswers(),
        repository.listCalendar(),
      ]);
      academies = results[0] as List<AcademyMembership>;
      quota = results[1] as StudentQuota;
      assignments = results[2] as List<Assignment>;
      materials = results[3] as List<StudentMaterial>;
      wrongAnswers = results[4] as List<WrongAnswerItem>;
      calendar = results[5] as CalendarResponse;
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
  }) async {
    await repository.createWrongAnswer({
      'source_type': sourceType,
      'extracted_problem_text': problemText,
      'visibility': 'private',
      'memo': memo,
      'tags': [sourceType],
    });
    await refresh();
  }

  Future<void> exportWrongAnswerSheet(List<String> itemIds) async {
    await repository.exportWrongAnswers(itemIds, academyId: selectedContextId == 'personal' ? null : selectedContextId);
    await refresh();
  }
}

