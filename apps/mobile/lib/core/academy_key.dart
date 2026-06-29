String normalizeAcademyKey(String value) {
  return value.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
}

String formatAcademyKey(String value) {
  final normalized = normalizeAcademyKey(value);
  if (normalized.isEmpty) return '';
  final chunks = <String>[];
  for (var index = 0; index < normalized.length; index += 4) {
    final end = index + 4 > normalized.length ? normalized.length : index + 4;
    chunks.add(normalized.substring(index, end));
  }
  return chunks.join('-');
}

bool isMaskedAcademyKey(String value) {
  return value.contains('*');
}

bool isCompleteAcademyKey(String value) {
  return normalizeAcademyKey(value).length == 12;
}
