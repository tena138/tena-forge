const _configuredApiBaseUrl = String.fromEnvironment('API_BASE_URL');
const _configuredFrontendBaseUrl = String.fromEnvironment('FRONTEND_BASE_URL');

const productionApiBaseUrl = 'https://tena-forge-api.onrender.com';
const productionFrontendBaseUrl = 'https://www.tena-forge.com';
const localWebApiBaseUrl = 'http://127.0.0.1:8000';
const localDeviceApiBaseUrl = 'http://10.0.2.2:8000';
const localWebFrontendBaseUrl = 'http://127.0.0.1:3001';
const localDeviceFrontendBaseUrl = 'http://10.0.2.2:3001';

String get apiBaseUrl => _resolveBaseUrl(
  configured: _configuredApiBaseUrl,
  defaultValue: productionApiBaseUrl,
);

String get frontendBaseUrl => _resolveBaseUrl(
  configured: _configuredFrontendBaseUrl,
  defaultValue: productionFrontendBaseUrl,
);

String _resolveBaseUrl({
  required String configured,
  required String defaultValue,
}) {
  final value = configured.trim();
  return _withoutTrailingSlash(
    value.isNotEmpty ? value : defaultValue,
  );
}

bool get usesProductionApi => apiBaseUrl == productionApiBaseUrl;
bool get usesProductionFrontend => frontendBaseUrl == productionFrontendBaseUrl;

String _withoutTrailingSlash(String value) {
  var normalized = value;
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.substring(0, normalized.length - 1);
  }
  return normalized;
}
