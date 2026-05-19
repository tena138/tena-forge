import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tena_forge_student/app/theme.dart';
import 'package:tena_forge_student/widgets/premium_card.dart';

void main() {
  testWidgets('renders premium student card', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTenaTheme(),
        home: const Scaffold(
          body: PremiumCard(
            title: '오답노트',
            child: Text('개인 오답은 비공개입니다.'),
          ),
        ),
      ),
    );

    expect(find.text('오답노트'), findsOneWidget);
    expect(find.text('개인 오답은 비공개입니다.'), findsOneWidget);
  });
}

