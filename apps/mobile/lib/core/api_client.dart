import 'dart:convert';

import 'package:http/http.dart' as http;

import 'session_store.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  ApiClient({required this.baseUrl, required this.sessionStore});

  final String baseUrl;
  final SessionStore sessionStore;

  Future<T> get<T>(String path, T Function(Object? json) decode) async {
    final response = await _send('GET', path);
    return decode(_decode(response));
  }

  Future<T> post<T>(String path, Object? body, T Function(Object? json) decode) async {
    final response = await _send('POST', path, body: body);
    return decode(_decode(response));
  }

  Future<http.Response> _send(String method, String path, {Object? body}) async {
    final token = await sessionStore.readAccessToken();
    final uri = Uri.parse('$baseUrl$path');
    final headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
      'X-Requested-With': 'XMLHttpRequest',
    };
    final encodedBody = body == null ? null : jsonEncode(body);
    final response = switch (method) {
      'GET' => await http.get(uri, headers: headers),
      'POST' => await http.post(uri, headers: headers, body: encodedBody),
      _ => throw ArgumentError('Unsupported method $method'),
    };
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.body.isEmpty ? 'Request failed' : response.body, statusCode: response.statusCode);
    }
    return response;
  }

  Object? _decode(http.Response response) {
    if (response.body.isEmpty) return null;
    return jsonDecode(utf8.decode(response.bodyBytes));
  }
}

