import 'package:flutter/foundation.dart';

const _configuredApiBaseUrl = String.fromEnvironment('API_BASE_URL');
const _configuredFrontendBaseUrl = String.fromEnvironment('FRONTEND_BASE_URL');

String get apiBaseUrl => _resolveBaseUrl(
  configured: _configuredApiBaseUrl,
  webDefault: 'http://127.0.0.1:8000',
  deviceDefault: 'http://10.0.2.2:8000',
);

String get frontendBaseUrl => _resolveBaseUrl(
  configured: _configuredFrontendBaseUrl,
  webDefault: 'http://127.0.0.1:3001',
  deviceDefault: 'http://10.0.2.2:3001',
);

String _resolveBaseUrl({
  required String configured,
  required String webDefault,
  required String deviceDefault,
}) {
  final value = configured.trim();
  return _withoutTrailingSlash(
    value.isNotEmpty ? value : (kIsWeb ? webDefault : deviceDefault),
  );
}

String _withoutTrailingSlash(String value) {
  var normalized = value;
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.substring(0, normalized.length - 1);
  }
  return normalized;
}
