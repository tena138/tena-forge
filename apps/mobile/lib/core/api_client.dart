import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'session_store.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  String get displayMessage {
    try {
      final decoded = jsonDecode(message);
      if (decoded is Map) {
        final detail = decoded['detail'];
        if (detail is String) return detail;
        if (detail is Map && detail['message'] is String) {
          return detail['message'] as String;
        }
      }
    } catch (_) {
      // Fall back to the raw message below.
    }
    return message;
  }

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  ApiClient({required this.baseUrl, required this.sessionStore});

  final String baseUrl;
  final SessionStore sessionStore;
  static const _refreshCookieName = 'refresh_token';

  Future<T> get<T>(String path, T Function(Object? json) decode) async {
    final response = await _send('GET', path);
    return decode(_decode(response));
  }

  Future<T> post<T>(
    String path,
    Object? body,
    T Function(Object? json) decode,
  ) async {
    final response = await _send('POST', path, body: body);
    return decode(_decode(response));
  }

  Future<T> uploadFile<T>(
    String path, {
    required String fieldName,
    required String filePath,
    String? filename,
    required T Function(Object? json) decode,
  }) async {
    final token = await sessionStore.readAccessToken();
    final refreshCookie = await sessionStore.readRefreshCookie();
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'));
    final headers = <String, String>{
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (token != null) headers['Authorization'] = 'Bearer $token';
    if (!kIsWeb && refreshCookie != null) headers['Cookie'] = refreshCookie;
    request.headers.addAll(headers);
    request.files.add(
      await http.MultipartFile.fromPath(
        fieldName,
        filePath,
        filename: filename,
        contentType: _contentTypeFor(filename ?? filePath),
      ),
    );
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        response.body.isEmpty ? 'Request failed' : response.body,
        statusCode: response.statusCode,
      );
    }
    return decode(_decode(response));
  }

  Future<http.Response> _send(
    String method,
    String path, {
    Object? body,
    bool allowRefresh = true,
  }) async {
    final token = await sessionStore.readAccessToken();
    final refreshCookie = await sessionStore.readRefreshCookie();
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (token != null) headers['Authorization'] = 'Bearer $token';
    if (!kIsWeb && refreshCookie != null) headers['Cookie'] = refreshCookie;
    final encodedBody = body == null ? null : jsonEncode(body);
    final response = switch (method) {
      'GET' => await http.get(uri, headers: headers),
      'POST' => await http.post(uri, headers: headers, body: encodedBody),
      _ => throw ArgumentError('Unsupported method $method'),
    };
    await _persistRefreshCookie(response);
    if (allowRefresh &&
        response.statusCode == 401 &&
        path != '/api/auth/login' &&
        path != '/api/auth/refresh') {
      final refreshed = await refreshAccessToken();
      if (refreshed) {
        return _send(method, path, body: body, allowRefresh: false);
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        response.body.isEmpty ? 'Request failed' : response.body,
        statusCode: response.statusCode,
      );
    }
    return response;
  }

  Future<bool> refreshAccessToken() async {
    if (kIsWeb) return false;
    final refreshCookie = await sessionStore.readRefreshCookie();
    if (refreshCookie == null) return false;
    try {
      final response = await _send(
        'POST',
        '/api/auth/refresh',
        allowRefresh: false,
      );
      final json = _decode(response);
      if (json is! Map) return false;
      final token = json['access_token']?.toString();
      if (token == null || token.isEmpty) return false;
      await sessionStore.writeAccessToken(token);
      return true;
    } catch (_) {
      await sessionStore.clear();
      return false;
    }
  }

  Future<void> _persistRefreshCookie(http.Response response) async {
    if (kIsWeb) return;
    final setCookie = response.headers['set-cookie'];
    if (setCookie == null || !setCookie.contains('$_refreshCookieName=')) {
      return;
    }
    final match = RegExp(
      '(?:^|,\\s*)$_refreshCookieName=([^;]*)',
    ).firstMatch(setCookie);
    final value = match?.group(1);
    await sessionStore.writeRefreshCookie(
      value == null || value.isEmpty ? null : '$_refreshCookieName=$value',
    );
  }

  Object? _decode(http.Response response) {
    if (response.body.isEmpty) return null;
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  MediaType _contentTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return MediaType('image', 'png');
    if (lower.endsWith('.webp')) return MediaType('image', 'webp');
    return MediaType('image', 'jpeg');
  }
}
