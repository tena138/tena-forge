import 'dart:convert';

const Map<int, int> _windows1252Bytes = {
  0x20AC: 0x80,
  0x201A: 0x82,
  0x0192: 0x83,
  0x201E: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02C6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8A,
  0x2039: 0x8B,
  0x0152: 0x8C,
  0x017D: 0x8E,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201C: 0x93,
  0x201D: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02DC: 0x98,
  0x2122: 0x99,
  0x0161: 0x9A,
  0x203A: 0x9B,
  0x0153: 0x9C,
  0x017E: 0x9E,
  0x0178: 0x9F,
};

String repairKoreanText(String value) {
  var text = value.trim();
  if (text.isEmpty) return text;
  text = _repairUtf8MojibakeRuns(text);
  text = _repairReplacementKorean(text);
  return text
      .replaceAll(RegExp(r'[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String _repairUtf8MojibakeRuns(String value) {
  final buffer = StringBuffer();
  final run = <int>[];

  void flushRun() {
    if (run.isEmpty) return;
    final repaired = _decodeMojibakeRun(run);
    buffer.write(repaired ?? String.fromCharCodes(run));
    run.clear();
  }

  for (final codePoint in value.runes) {
    final byte = _mojibakeByte(codePoint);
    if (byte != null && byte >= 0x80) {
      run.add(codePoint);
    } else {
      flushRun();
      buffer.writeCharCode(codePoint);
    }
  }
  flushRun();
  return buffer.toString();
}

String? _decodeMojibakeRun(List<int> runes) {
  final bytes = <int>[];
  for (final codePoint in runes) {
    final byte = _mojibakeByte(codePoint);
    if (byte == null) return null;
    bytes.add(byte);
  }
  if (bytes.length < 2) return null;
  try {
    final decoded = utf8.decode(bytes, allowMalformed: false);
    return _textScore(decoded) > _textScore(String.fromCharCodes(runes))
        ? decoded
        : null;
  } on FormatException {
    return null;
  }
}

int? _mojibakeByte(int codePoint) {
  if (codePoint <= 0xFF) return codePoint;
  return _windows1252Bytes[codePoint];
}

int _textScore(String value) {
  var score = 0;
  for (final codePoint in value.runes) {
    if (codePoint >= 0xAC00 && codePoint <= 0xD7A3) score += 4;
    if (codePoint >= 0x3130 && codePoint <= 0x318F) score += 2;
    if (codePoint == 0xFFFD || codePoint == 0x25A1) score -= 8;
    if (codePoint >= 0x0080 && codePoint <= 0x009F) score -= 4;
  }
  return score;
}

String _repairReplacementKorean(String value) {
  const boxClass = r'[\uFFFD\u25A1\u25A0]';
  return value
      .replaceAll(RegExp('\uD574$boxClass{1,4}'), '\uD574\uC124')
      .replaceAll(RegExp('\uC815$boxClass{1,4}'), '\uC815\uB2F5')
      .replaceAll(RegExp('\uBB38$boxClass{1,4}'), '\uBB38\uC81C')
      .replaceAll(RegExp(boxClass), '');
}
