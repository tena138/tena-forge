import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:tena_forge_student/core/text_encoding.dart';

void main() {
  test('repairs UTF-8 text decoded as Latin-1', () {
    const fixedTitle = '2\uD68C \uD574\uC124 \uC678 1\uAC1C';
    final mojibake = String.fromCharCodes(utf8.encode(fixedTitle));

    expect(repairKoreanText(mojibake), fixedTitle);
  });

  test('repairs common replacement boxes in Korean material titles', () {
    const fixedTitle = '2\uD68C \uD574\uC124 \uC678 1\uAC1C';

    expect(
      repairKoreanText('2\uD68C \uD574\uFFFD\uFFFD\uFFFD \uC678 1\uAC1C'),
      fixedTitle,
    );
    expect(
      repairKoreanText('2\uD68C \uD574\u25A1\u25A1\u25A1 \uC678 1\uAC1C'),
      fixedTitle,
    );
  });
}
