import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/context_switcher.dart';
import '../widgets/list_item_card.dart';
import '../widgets/metric_tile.dart';
import '../widgets/premium_card.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StudentAppState>();
    final quota = state.quota;
    final assignments = state.assignments.take(3).toList();
    return AppScaffold(
      title: '오늘의 학습 운영',
      subtitle: '개인 오답과 학원별 과제, 자료, quota를 한 화면에서 확인합니다.',
      actions: [
        IconButton(onPressed: () => context.push('/profile'), icon: const Icon(Icons.person_outline)),
      ],
      children: [
        const ContextSwitcher(),
        Row(
          children: [
            MetricTile(label: '업로드', value: '${quota?.remaining['upload'] ?? 5}', helper: '남은 횟수'),
            const SizedBox(width: 10),
            MetricTile(label: '추출', value: '${quota?.remaining['extraction'] ?? 5}', helper: '오늘 가능'),
            const SizedBox(width: 10),
            MetricTile(label: '내보내기', value: '${quota?.remaining['export'] ?? 5}', helper: '워터마크'),
          ],
        ),
        PremiumCard(
          title: '다음 액션',
          eyebrow: state.selectedContextLabel,
          child: Column(
            children: [
              FilledButton.icon(
                onPressed: () => context.push('/register-academy-key'),
                icon: const Icon(Icons.key),
                label: const Text('학원 키 등록'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => context.push('/add-wrong-answer'),
                icon: const Icon(Icons.camera_alt_outlined),
                label: const Text('사진으로 오답 추가'),
              ),
            ],
          ),
        ),
        PremiumCard(
          title: '다가오는 과제 / 테스트',
          child: Column(
            children: [
              for (final assignment in assignments) ...[
                ListItemCard(
                  title: assignment.title,
                  subtitle: assignment.dueAt == null ? assignment.description : '마감 ${MaterialLocalizations.of(context).formatFullDate(assignment.dueAt!)}',
                  badge: assignment.assignmentType,
                  onTap: () => context.push('/assignment/${assignment.id}'),
                ),
                if (assignment != assignments.last) const SizedBox(height: 10),
              ],
              if (assignments.isEmpty) const Text('표시할 과제가 없습니다.', style: TextStyle(color: AppColors.muted)),
            ],
          ),
        ),
        PremiumCard(
          title: '오답 복습 큐',
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '오늘 복습할 개인/학원 연결 오답 ${state.wrongAnswers.length}개',
                  style: const TextStyle(color: AppColors.muted),
                ),
              ),
              TextButton(onPressed: () => context.go('/wrong-answers'), child: const Text('열기')),
            ],
          ),
        ),
      ],
    );
  }
}

