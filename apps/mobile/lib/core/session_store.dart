import '../models/student_models.dart';
import 'session_store_platform.dart';

abstract class SessionStore {
  Future<String?> readAccessToken();
  Future<void> writeAccessToken(String? token);
  Future<String?> readRefreshCookie();
  Future<void> writeRefreshCookie(String? cookie);
  Future<StudentProfile?> readProfile();
  Future<void> writeProfile(StudentProfile? profile);
  Future<void> clear();
}

SessionStore createSessionStore() => createPlatformSessionStore();
