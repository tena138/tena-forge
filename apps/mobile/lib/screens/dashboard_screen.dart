import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/context_switcher.dart';
import '../widgets/list_item_card.dart';
import '../widgets/premium_card.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StudentAppState>();
    final assignments = state.assignments.take(3).toList();
    return AppScaffold(
      title: '오늘의 학습 운영',
      subtitle: '사진으로 저장한 개인 오답과 학원별 과제, 복습 흐름을 한 화면에서 확인합니다.',
      actions: [
        IconButton(
          onPressed: () => context.push('/profile'),
          icon: const Icon(Icons.person_outline),
        ),
      ],
      children: [
        const ContextSwitcher(),
        PremiumCard(
          title: '다음 액션',
          eyebrow: state.selectedContextLabel,
          child: Column(
            children: [
              const ListItemCard(
                title: '학원 키 추가',
                subtitle: '학원에서 받은 키를 등록하면 클래스 일정, 과제, 자료가 자동으로 연결됩니다.',
                badge: 'key',
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
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
                  subtitle: assignment.dueAt == null
                      ? assignment.description
                      : '마감 ${MaterialLocalizations.of(context).formatFullDate(assignment.dueAt!)}',
                  badge: assignment.badgeLabel,
                  trailing: Icon(
                    assignment.isCompleted
                        ? Icons.check_circle
                        : assignment.isAwaitingTeacherConfirmation
                        ? Icons.pending_actions
                        : Icons.chevron_right,
                    color: assignment.isCompleted
                        ? AppColors.success
                        : assignment.isAwaitingTeacherConfirmation
                        ? AppColors.warning
                        : AppColors.muted,
                  ),
                  onTap: () => context.push('/assignment/${assignment.id}'),
                ),
                if (assignment != assignments.last) const SizedBox(height: 10),
              ],
              if (assignments.isEmpty)
                const Text(
                  '표시할 과제가 없습니다.',
                  style: TextStyle(color: AppColors.muted),
                ),
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
              TextButton(
                onPressed: () => context.go('/wrong-answers'),
                child: const Text('열기'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
