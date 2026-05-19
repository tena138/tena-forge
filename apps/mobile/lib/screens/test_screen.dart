import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class TestScreen extends StatelessWidget {
  const TestScreen({required this.assignmentId, super.key});

  final String assignmentId;

  @override
  Widget build(BuildContext context) {
    final assignment = context.watch<StudentAppState>().assignments.where((item) => item.id == assignmentId).firstOrNull;
    return AppScaffold(
      title: assignment?.title ?? 'Timed Test',
      subtitle: '서버가 시작 시각, 만료 시각, 제출 시각, suspicious event를 기록하는 응시 화면입니다.',
      children: [
        PremiumCard(
          title: '테스트 세션',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('제한 시간: ${assignment?.timeLimitMinutes ?? '-'}분', style: const TextStyle(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              const Text(
                '다음 단계에서 문항별 답안 입력, 자동저장, 남은 시간 타이머, 만료 시 자동 제출을 연결합니다. 백엔드 세션 기록 API는 이미 연결되어 있습니다.',
                style: TextStyle(color: AppColors.muted, height: 1.5),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

