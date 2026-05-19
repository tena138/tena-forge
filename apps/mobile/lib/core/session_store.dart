import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/student_models.dart';

abstract class SessionStore {
  Future<String?> readAccessToken();
  Future<void> writeAccessToken(String? token);
  Future<StudentProfile?> readProfile();
  Future<void> writeProfile(StudentProfile? profile);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore() : _storage = const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _tokenKey = 'tena.student.access_token';
  static const _profileIdKey = 'tena.student.profile.id';
  static const _profileEmailKey = 'tena.student.profile.email';
  static const _profileNameKey = 'tena.student.profile.name';

  @override
  Future<String?> readAccessToken() => _storage.read(key: _tokenKey);

  @override
  Future<void> writeAccessToken(String? token) async {
    if (token == null || token.isEmpty) {
      await _storage.delete(key: _tokenKey);
    } else {
      await _storage.write(key: _tokenKey, value: token);
    }
  }

  @override
  Future<StudentProfile?> readProfile() async {
    final id = await _storage.read(key: _profileIdKey);
    final email = await _storage.read(key: _profileEmailKey);
    if (id == null || email == null) return null;
    return StudentProfile(
      id: id,
      email: email,
      displayName: await _storage.read(key: _profileNameKey),
    );
  }

  @override
  Future<void> writeProfile(StudentProfile? profile) async {
    if (profile == null) {
      await _storage.delete(key: _profileIdKey);
      await _storage.delete(key: _profileEmailKey);
      await _storage.delete(key: _profileNameKey);
      return;
    }
    await _storage.write(key: _profileIdKey, value: profile.id);
    await _storage.write(key: _profileEmailKey, value: profile.email);
    await _storage.write(key: _profileNameKey, value: profile.displayName ?? '');
  }

  @override
  Future<void> clear() async {
    await writeAccessToken(null);
    await writeProfile(null);
  }
}

