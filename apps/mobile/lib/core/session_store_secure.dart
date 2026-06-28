import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/student_models.dart';
import 'session_store.dart';

class PlatformSessionStore implements SessionStore {
  PlatformSessionStore() : _storage = const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _tokenKey = 'tena.student.access_token';
  static const _refreshCookieKey = 'tena.student.refresh_cookie';
  static const _profileIdKey = 'tena.student.profile.id';
  static const _profileEmailKey = 'tena.student.profile.email';
  static const _profileNameKey = 'tena.student.profile.name';
  static const _profilePublicNameKey = 'tena.student.profile.public_name';
  static const _profileAccountTypeKey = 'tena.student.profile.account_type';
  static const _profilePersonalInfoKey = 'tena.student.profile.personal_info';

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
  Future<String?> readRefreshCookie() => _storage.read(key: _refreshCookieKey);

  @override
  Future<void> writeRefreshCookie(String? cookie) async {
    if (cookie == null || cookie.isEmpty) {
      await _storage.delete(key: _refreshCookieKey);
    } else {
      await _storage.write(key: _refreshCookieKey, value: cookie);
    }
  }

  @override
  Future<StudentProfile?> readProfile() async {
    final id = await _storage.read(key: _profileIdKey);
    final email = await _storage.read(key: _profileEmailKey);
    final displayName = await _storage.read(key: _profileNameKey);
    final profileName = await _storage.read(key: _profilePublicNameKey);
    final accountType = await _storage.read(key: _profileAccountTypeKey);
    final personalInfoJson = await _storage.read(key: _profilePersonalInfoKey);
    if (id == null || email == null) return null;
    return StudentProfile(
      id: id,
      email: email,
      displayName: displayName,
      profileName: profileName,
      accountType: accountType ?? 'academy',
      personalInfo: StudentPersonalInfo.fromJson(
        jsonDecode(personalInfoJson ?? '{}') as Map<String, dynamic>,
      ),
    );
  }

  @override
  Future<void> writeProfile(StudentProfile? profile) async {
    if (profile == null) {
      await _storage.delete(key: _profileIdKey);
      await _storage.delete(key: _profileEmailKey);
      await _storage.delete(key: _profileNameKey);
      await _storage.delete(key: _profilePublicNameKey);
      await _storage.delete(key: _profileAccountTypeKey);
      await _storage.delete(key: _profilePersonalInfoKey);
      return;
    }
    await _storage.write(key: _profileIdKey, value: profile.id);
    await _storage.write(key: _profileEmailKey, value: profile.email);
    await _storage.write(
      key: _profileNameKey,
      value: profile.displayName ?? '',
    );
    await _storage.write(
      key: _profilePublicNameKey,
      value: profile.profileName ?? '',
    );
    await _storage.write(
      key: _profileAccountTypeKey,
      value: profile.accountType,
    );
    await _storage.write(
      key: _profilePersonalInfoKey,
      value: jsonEncode(profile.personalInfo.toJson()),
    );
  }

  @override
  Future<void> clear() async {
    await writeAccessToken(null);
    await writeRefreshCookie(null);
    await writeProfile(null);
  }
}
