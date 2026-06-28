import 'dart:convert';

import 'package:web/web.dart' as web;

import '../models/student_models.dart';
import 'session_store.dart';

class PlatformSessionStore implements SessionStore {
  static const _tokenKey = 'tena.student.access_token';
  static const _refreshCookieKey = 'tena.student.refresh_cookie';
  static const _profileIdKey = 'tena.student.profile.id';
  static const _profileEmailKey = 'tena.student.profile.email';
  static const _profileNameKey = 'tena.student.profile.name';
  static const _profilePublicNameKey = 'tena.student.profile.public_name';
  static const _profileAccountTypeKey = 'tena.student.profile.account_type';
  static const _profilePersonalInfoKey = 'tena.student.profile.personal_info';

  String? _read(String key) => web.window.localStorage.getItem(key);

  void _write(String key, String? value) {
    if (value == null || value.isEmpty) {
      web.window.localStorage.removeItem(key);
    } else {
      web.window.localStorage.setItem(key, value);
    }
  }

  @override
  Future<String?> readAccessToken() async => _read(_tokenKey);

  @override
  Future<void> writeAccessToken(String? token) async {
    _write(_tokenKey, token);
  }

  @override
  Future<String?> readRefreshCookie() async => _read(_refreshCookieKey);

  @override
  Future<void> writeRefreshCookie(String? cookie) async {
    _write(_refreshCookieKey, cookie);
  }

  @override
  Future<StudentProfile?> readProfile() async {
    final id = _read(_profileIdKey);
    final email = _read(_profileEmailKey);
    if (id == null || email == null) return null;
    return StudentProfile(
      id: id,
      email: email,
      displayName: _read(_profileNameKey),
      profileName: _read(_profilePublicNameKey),
      accountType: _read(_profileAccountTypeKey) ?? 'academy',
      personalInfo: StudentPersonalInfo.fromJson(
        jsonDecode(_read(_profilePersonalInfoKey) ?? '{}')
            as Map<String, dynamic>,
      ),
    );
  }

  @override
  Future<void> writeProfile(StudentProfile? profile) async {
    if (profile == null) {
      _write(_profileIdKey, null);
      _write(_profileEmailKey, null);
      _write(_profileNameKey, null);
      _write(_profilePublicNameKey, null);
      _write(_profileAccountTypeKey, null);
      _write(_profilePersonalInfoKey, null);
      return;
    }
    _write(_profileIdKey, profile.id);
    _write(_profileEmailKey, profile.email);
    _write(_profileNameKey, profile.displayName ?? '');
    _write(_profilePublicNameKey, profile.profileName ?? '');
    _write(_profileAccountTypeKey, profile.accountType);
    _write(_profilePersonalInfoKey, jsonEncode(profile.personalInfo.toJson()));
  }

  @override
  Future<void> clear() async {
    await writeAccessToken(null);
    await writeRefreshCookie(null);
    await writeProfile(null);
  }
}
